import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMatchResultToStage,
  calculateStats,
  computePodium,
  createEmptyStats,
  generateMatches,
  hasPlayedDownstreamMatches,
  rankParticipantsAcrossGroups,
  renameParticipantInStage,
  validateAndComputeScore,
} from '../src/utils/tournamentEngine.js';

const makeTeams = (count, seedIndices = []) =>
  Array.from({ length: count }, (_, i) => ({
    id: `T${i + 1}`,
    name: `Team ${i + 1}`,
    isSeed: seedIndices.includes(i),
    groupId: 'A',
    stats: createEmptyStats(),
  }));

describe('Tournament Engine — Core Logic & Regression Suite', () => {
  it('1. Single Elimination places isSeed teams into BYE slots even if listed last', () => {
    // 5 teams -> 8-bracket -> 3 BYEs. Mark Team 4 & Team 5 (last in list!) as seeds.
    const teams = makeTeams(5, [3, 4]);
    const config = { format: 'SINGLE', sport: 'BASKETBALL', bestOf: 1, hasThirdPlace: true };
    const matches = generateMatches(1, config, teams);

    const r1 = matches.filter((m) => m.roundIndex === 0);
    const autoAdvancedIds = r1
      .filter((m) => m.topTeam.id === 'BYE' || m.bottomTeam.id === 'BYE')
      .map((m) => (m.topTeam.id === 'BYE' ? m.bottomTeam.id : m.topTeam.id));

    assert.ok(autoAdvancedIds.includes('T4'), 'Seeded Team 4 must receive a BYE');
    assert.ok(autoAdvancedIds.includes('T5'), 'Seeded Team 5 must receive a BYE');
  });

  it('2. Score validation & tie handling never falsely awards bottomTeam winner', () => {
    // Round Robin draw 2-2
    const drawRes = validateAndComputeScore({
      sets: [{ a: '2', b: '2' }],
      localBestOf: 1,
      sportId: 'BASKETBALL',
      format: 'ROUND_ROBIN',
    });
    assert.equal(drawRes.error, null);
    assert.equal(drawRes.result.topIsWinner, false);
    assert.equal(drawRes.result.bottomIsWinner, false);

    // Elimination tie 50-50 must be blocked
    const elimTie = validateAndComputeScore({
      sets: [{ a: '50', b: '50' }],
      localBestOf: 1,
      sportId: 'BASKETBALL',
      format: 'SINGLE',
    });
    assert.ok(elimTie.error, 'Elimination tie must return error');

    // Empty input must be blocked instead of saving 0-0
    const emptyRes = validateAndComputeScore({
      sets: [{ a: '', b: '' }],
      localBestOf: 1,
      sportId: 'BASKETBALL',
      format: 'SINGLE',
    });
    assert.ok(emptyRes.error, 'Empty sets must return error');

    // Best-of-3 mid-match 1-1 partial save keeps both isWinner false
    const midSeries = validateAndComputeScore({
      sets: [
        { a: '25', b: '20' },
        { a: '20', b: '25' },
        { a: '', b: '' },
      ],
      localBestOf: 3,
      sportId: 'VOLLEYBALL',
      format: 'SINGLE',
    });
    assert.equal(midSeries.error, null);
    assert.equal(midSeries.result.scoreA, 1);
    assert.equal(midSeries.result.scoreB, 1);
    assert.equal(midSeries.result.topIsWinner, false);
    assert.equal(midSeries.result.bottomIsWinner, false);
  });

  it('3. Sport rules: Badminton 30-29 golden point & Dodgeball 1-pt margin are valid', () => {
    const badmintonCap = validateAndComputeScore({
      sets: [
        { a: '30', b: '29' },
        { a: '21', b: '18' },
        { a: '', b: '' },
      ],
      localBestOf: 3,
      sportId: 'BADMINTON',
      format: 'SINGLE',
    });
    assert.equal(badmintonCap.error, null);
    assert.equal(badmintonCap.result.topIsWinner, true);

    const badminton20 = validateAndComputeScore({
      sets: [{ a: '21', b: '20' }],
      localBestOf: 1,
      sportId: 'BADMINTON',
      format: 'SINGLE',
    });
    assert.ok(badminton20.error, '21-20 without cap or custom margin should fail');

    const dodgeball1Pt = validateAndComputeScore({
      sets: [
        { a: '5', b: '4' },
        { a: '6', b: '5' },
        { a: '', b: '' },
      ],
      localBestOf: 3,
      sportId: 'DODGEBALL',
      format: 'SINGLE',
    });
    assert.equal(dodgeball1Pt.error, null);
    assert.equal(dodgeball1Pt.result.topIsWinner, true);
  });

  it('4. Upstream result edit cascades cleanly & reverts forfeit state', () => {
    const teams = makeTeams(4);
    const config = { format: 'SINGLE', sport: 'BASKETBALL', bestOf: 1, hasThirdPlace: true };
    let stage = {
      id: 1,
      name: 'Stage 1',
      status: 'ACTIVE',
      config,
      participants: teams,
      matches: generateMatches(1, config, teams),
    };

    const sf1 = stage.matches.find((m) => m.roundIndex === 0);
    // Step 1: Set bottomTeam forfeit -> topTeam wins SF1
    stage = applyMatchResultToStage(stage, sf1.id, {
      isForfeit: true,
      winnerId: sf1.topTeam.id,
    });
    let finalMatch = stage.matches.find((m) => m.bracketType === 'final');
    assert.equal(finalMatch.topTeam.id, sf1.topTeam.id);

    // Step 2: Finish SF2 and play Final!
    const sf2 = stage.matches.filter((m) => m.roundIndex === 0)[1];
    stage = applyMatchResultToStage(stage, sf2.id, {
      scoreA: 60,
      scoreB: 50,
      topIsWinner: true,
      bottomIsWinner: false,
      isForfeit: false,
    });
    finalMatch = stage.matches.find((m) => m.bracketType === 'final');
    stage = applyMatchResultToStage(stage, finalMatch.id, {
      scoreA: 70,
      scoreB: 65,
      topIsWinner: true,
      bottomIsWinner: false,
      isForfeit: false,
    });
    assert.equal(hasPlayedDownstreamMatches(stage.matches, sf1.id), true);

    // Step 3: Edit SF1 so bottomTeam wins by normal score (no longer forfeit!)
    stage = applyMatchResultToStage(stage, sf1.id, {
      scoreA: 40,
      scoreB: 55,
      topIsWinner: false,
      bottomIsWinner: true,
      isForfeit: false,
    });

    const updatedSf1 = stage.matches.find((m) => m.id === sf1.id);
    assert.equal(updatedSf1.topTeam.isForfeit, false);
    assert.equal(updatedSf1.bottomTeam.isForfeit, false);

    // Final must now have sf1.bottomTeam AND its stale score (70-65) must be cleared!
    finalMatch = stage.matches.find((m) => m.bracketType === 'final');
    assert.equal(finalMatch.topTeam.id, sf1.bottomTeam.id);
    assert.equal(finalMatch.topTeam.score, null);
    assert.equal(finalMatch.topTeam.isWinner, false);
  });

  it('5. Double Elimination works for 2 teams AND supports Standard Bracket Reset', () => {
    const teams = makeTeams(2);
    const config = { format: 'DOUBLE', sport: 'BASKETBALL', bestOf: 1, hasBracketReset: true };
    let stage = {
      id: 1,
      name: 'DE 2 Teams',
      status: 'ACTIVE',
      config,
      participants: teams,
      matches: generateMatches(1, config, teams),
    };

    const wb1 = stage.matches.find((m) => m.bracketType === 'winner');
    // T1 beats T2 in WB1
    stage = applyMatchResultToStage(stage, wb1.id, {
      scoreA: 21,
      scoreB: 15,
      topIsWinner: true,
      bottomIsWinner: false,
      isForfeit: false,
    });

    let gf = stage.matches.find((m) => m.bracketType === 'final');
    assert.equal(gf.topTeam.id, 'T1');
    assert.equal(gf.bottomTeam.id, 'T2');

    // Case A: WB Champ (T1) wins GF1 -> Reset match skipped, T1 is Champion!
    let stageCaseA = applyMatchResultToStage(stage, gf.id, {
      scoreA: 21,
      scoreB: 18,
      topIsWinner: true,
      bottomIsWinner: false,
      isForfeit: false,
    });
    const resetA = stageCaseA.matches.find((m) => m.bracketType === 'final_reset');
    assert.equal(resetA.isSkipped, true);
    assert.equal(computePodium(stageCaseA)[0]?.id, 'T1');

    // Case B: LB Champ (T2) wins GF1 -> Reset match activates, T2 wins Reset -> T2 is Champion!
    let stageCaseB = applyMatchResultToStage(stage, gf.id, {
      scoreA: 17,
      scoreB: 21,
      topIsWinner: false,
      bottomIsWinner: true,
      isForfeit: false,
    });
    const resetB = stageCaseB.matches.find((m) => m.bracketType === 'final_reset');
    assert.equal(resetB.isSkipped, false);
    assert.equal(resetB.topTeam.id, 'T1');
    assert.equal(resetB.bottomTeam.id, 'T2');
    // Champion not decided until Reset is played!
    assert.equal(computePodium(stageCaseB)[0], undefined);

    stageCaseB = applyMatchResultToStage(stageCaseB, resetB.id, {
      scoreA: 19,
      scoreB: 21,
      topIsWinner: false,
      bottomIsWinner: true,
      isForfeit: false,
    });
    const podiumB = computePodium(stageCaseB);
    assert.equal(podiumB[0]?.id, 'T2');
    assert.equal(podiumB[1]?.id, 'T1');
  });

  it('6. Double Elimination handles 9 teams (7 BYEs including BYE-vs-BYE in LB) to completion', () => {
    const teams = makeTeams(9, [0, 1, 2]);
    const config = { format: 'DOUBLE', sport: 'BASKETBALL', bestOf: 1, hasBracketReset: true };
    let stage = {
      id: 1,
      name: 'DE 9 Teams',
      status: 'ACTIVE',
      config,
      participants: teams,
      matches: generateMatches(1, config, teams),
    };

    // Simulate playing every playable match until tournament completes
    let guard = 0;
    while (guard++ < 50) {
      const nextPlayable = stage.matches.find(
        (m) =>
          !m.isSkipped &&
          !m.isDoubleBye &&
          m.topTeam.id &&
          m.bottomTeam.id &&
          m.topTeam.id !== 'BYE' &&
          m.bottomTeam.id !== 'BYE' &&
          !m.topTeam.isWinner &&
          !m.bottomTeam.isWinner
      );
      if (!nextPlayable) break;

      stage = applyMatchResultToStage(stage, nextPlayable.id, {
        scoreA: 25,
        scoreB: 20,
        topIsWinner: true,
        bottomIsWinner: false,
        isForfeit: false,
      });
    }

    const podium = computePodium(stage);
    assert.ok(podium[0]?.id && podium[0].id !== 'BYE', 'Champion must be a real team');
    assert.ok(podium[1]?.id && podium[1].id !== 'BYE', 'Runner-up must be a real team');
    assert.ok(podium[2]?.id && podium[2].id !== 'BYE', '3rd place must be a real team');
  });

  it('7. Unequal multi-group Round Robin ranks by groupRank first & persists stats', () => {
    const pList = [
      { id: 'A1', name: 'A1', groupId: 'A', stats: { played: 3, won: 3, drawn: 0, lost: 0, gf: 9, ga: 0, gd: 9, pts: 9 } },
      { id: 'A2', name: 'A2', groupId: 'A', stats: { played: 3, won: 2, drawn: 0, lost: 1, gf: 6, ga: 3, gd: 3, pts: 6 } },
      { id: 'B1', name: 'B1', groupId: 'B', stats: { played: 2, won: 2, drawn: 0, lost: 0, gf: 6, ga: 1, gd: 5, pts: 6 } },
    ];
    const ranked = rankParticipantsAcrossGroups(pList);
    // B1 is #1 in Group B (2W 0L, 3.0 ppg), A2 is #2 in Group A (2W 1L, 6 pts). B1 MUST rank above A2!
    assert.equal(ranked[0].id, 'A1');
    assert.equal(ranked[1].id, 'B1');
    assert.equal(ranked[2].id, 'A2');
  });

  it('8. renameParticipantInStage updates match cards without resetting scores', () => {
    const teams = makeTeams(2);
    const config = { format: 'SINGLE', sport: 'BASKETBALL', bestOf: 1 };
    let stage = {
      id: 1,
      name: 'Stage 1',
      status: 'ACTIVE',
      config,
      participants: teams,
      matches: generateMatches(1, config, teams),
    };
    stage = applyMatchResultToStage(stage, stage.matches[0].id, {
      scoreA: 88,
      scoreB: 77,
      topIsWinner: true,
      bottomIsWinner: false,
      isForfeit: false,
    });
    stage = renameParticipantInStage(stage, 'T1', '金州勇士隊');
    assert.equal(stage.matches[0].topTeam.name, '金州勇士隊');
    assert.equal(stage.matches[0].topTeam.score, 88);
    assert.equal(stage.matches[0].topTeam.isWinner, true);
    assert.equal(calculateStats(stage.participants, stage.matches)[0].stats.pts, 3);
  });

  it('9. Soccer & Futsal knockout tie (1:1) advances PK winner via penaltyScore while preserving regulation goals', () => {
    const teams = makeTeams(4);
    const config = { format: 'SINGLE', sport: 'SOCCER', bestOf: 1, hasThirdPlace: true };
    let stage = {
      id: 1,
      name: '足球四強賽',
      status: 'ACTIVE',
      config,
      participants: teams,
      matches: generateMatches(1, config, teams),
    };

    // Validate 1:1 regulation tie with PK 4:5 -> bottomTeam wins
    const validated = validateAndComputeScore({
      sets: [{ a: '1', b: '1' }],
      localBestOf: 1,
      sportId: 'SOCCER',
      format: 'SINGLE',
      penaltySet: { a: '4', b: '5' },
    });
    assert.equal(validated.error, null);
    assert.equal(validated.result.scoreA, 1);
    assert.equal(validated.result.scoreB, 1);
    assert.deepEqual(validated.result.penaltyScore, { a: 4, b: 5 });
    assert.equal(validated.result.topIsWinner, false);
    assert.equal(validated.result.bottomIsWinner, true);

    const sf1 = stage.matches.find((m) => m.roundIndex === 0);
    stage = applyMatchResultToStage(stage, sf1.id, validated.result);

    const updatedSf1 = stage.matches.find((m) => m.id === sf1.id);
    assert.equal(updatedSf1.topTeam.score, 1);
    assert.equal(updatedSf1.bottomTeam.score, 1);
    assert.deepEqual(updatedSf1.penaltyScore, { a: 4, b: 5 });
    assert.equal(updatedSf1.bottomTeam.isWinner, true);

    const finalMatch = stage.matches.find((m) => m.bracketType === 'final');
    assert.equal(finalMatch.topTeam.id, sf1.bottomTeam.id);
  });
});
