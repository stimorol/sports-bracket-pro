import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSeriesToNextGame,
  applyBaseballPitchAction,
  applyPickleballRally,
  computeTableTennisServer,
  createInitialScoreboardState,
  evaluateSeriesProgress,
  evaluateSetStatus,
  getCurrentGameTotals,
  getPickleballCallout,
  summarizeScoreboardToMatchResult,
} from '../src/utils/scoreboardEngine.js';
import { buildMatchRecordData } from '../src/utils/matchRecordBuilder.js';

describe('Digital Scoreboard Engine — Sport-Specific Rules & Pickleball Tests', () => {
  it('1. Pickleball Doubles Side-Out starts at 0-0-2 and transitions Server #1 -> #2 -> Side-Out accurately', () => {
    const mockMatch = {
      id: 'S1-R1-M1',
      topTeam: { id: 'T1', name: '閃電隊', score: null },
      bottomTeam: { id: 'T2', name: '暴風隊', score: null },
      setScores: [],
    };
    let state = createInitialScoreboardState(mockMatch, {
      sport: 'PICKLEBALL',
      bestOf: 3,
    });

    // Opening rule: 0 - 0 - 2 (Team A, Server #2, Right/Even court)
    assert.equal(getPickleballCallout(state).code, '0 - 0 - 2');
    assert.equal(state.servingSide, 'a');
    assert.equal(state.serverNumber, 2);

    // Team A scores on opening serve -> 1 - 0 - 2
    state = applyPickleballRally(state, 'SERVER_SCORES');
    assert.equal(getPickleballCallout(state).code, '1 - 0 - 2');
    assert.match(getPickleballCallout(state).courtSideLabel, /左發球區/);

    // Team A faults (was Server #2) -> immediate Side-Out to Team B Server #1! Callout: 0 - 1 - 1
    state = applyPickleballRally(state, 'SIDE_OUT_OR_FAULT');
    assert.equal(state.servingSide, 'b');
    assert.equal(state.serverNumber, 1);
    assert.equal(getPickleballCallout(state).code, '0 - 1 - 1');

    // Team B Server #1 faults -> stays on Team B, moves to Server #2! Callout: 0 - 1 - 2
    state = applyPickleballRally(state, 'SIDE_OUT_OR_FAULT');
    assert.equal(state.servingSide, 'b');
    assert.equal(state.serverNumber, 2);
    assert.equal(getPickleballCallout(state).code, '0 - 1 - 2');

    // Team B Server #2 scores twice -> 2 - 1 - 2
    state = applyPickleballRally(state, 'SERVER_SCORES');
    state = applyPickleballRally(state, 'SERVER_SCORES');
    assert.equal(getPickleballCallout(state).code, '2 - 1 - 2');

    // Team B Server #2 faults -> Side-Out back to Team A Server #1! Callout: 1 - 2 - 1
    state = applyPickleballRally(state, 'SIDE_OUT_OR_FAULT');
    assert.equal(state.servingSide, 'a');
    assert.equal(state.serverNumber, 1);
    assert.equal(getPickleballCallout(state).code, '1 - 2 - 1');
  });

  it('2. Table Tennis service alternates every 2 points, then every 1 point at 10-10 Deuce', () => {
    assert.equal(computeTableTennisServer(0, 0, 'a', 11), 'a');
    assert.equal(computeTableTennisServer(1, 0, 'a', 11), 'a');
    assert.equal(computeTableTennisServer(1, 1, 'a', 11), 'b');
    assert.equal(computeTableTennisServer(2, 1, 'a', 11), 'b');
    assert.equal(computeTableTennisServer(2, 2, 'a', 11), 'a');

    // Deuce at 10-10: alternates every single point
    assert.equal(computeTableTennisServer(10, 10, 'a', 11), 'a');
    assert.equal(computeTableTennisServer(11, 10, 'a', 11), 'b');
    assert.equal(computeTableTennisServer(11, 11, 'a', 11), 'a');
    assert.equal(computeTableTennisServer(11, 12, 'a', 11), 'b');
  });

  it('3. evaluateSetStatus detects Set Point, Match Point, Deuce, Badminton 30-pt Cap, and Deciding Midpoint', () => {
    const badmintonState = {
      completedSets: [{ a: 21, b: 18 }], // Team A leads 1-0 in Best of 3
      currentScore: { a: 20, b: 19 },
      rules: { bestOf: 3, targetPoints: 21, decidingSetPoints: 21, capScore: 30, winByTwo: true },
    };

    // 20-19 with 1 set already won -> Match Point for A!
    const status1 = evaluateSetStatus(badmintonState);
    assert.equal(status1.pointAlert?.type, 'MATCH_POINT');
    assert.equal(status1.pointAlert?.side, 'a');

    // 20-20 -> Deuce
    const statusDeuce = evaluateSetStatus({
      ...badmintonState,
      currentScore: { a: 20, b: 20 },
    });
    assert.equal(statusDeuce.pointAlert?.type, 'DEUCE');

    // 29-29 -> Next point wins at 30 cap!
    const statusCap = evaluateSetStatus({
      ...badmintonState,
      currentScore: { a: 30, b: 29 },
    });
    assert.equal(statusCap.setWinner, 'a');

    // Deciding set midpoint alert (Pickleball 11-pt deciding set reaches 6-4)
    const decidingMid = evaluateSetStatus({
      completedSets: [
        { a: 11, b: 7 },
        { a: 8, b: 11 },
      ],
      currentScore: { a: 6, b: 4 },
      rules: { bestOf: 3, targetPoints: 11, decidingSetPoints: 11, winByTwo: true },
    });
    assert.equal(decidingMid.isDecidingSet, true);
    assert.equal(decidingMid.reachedDecidingMidpoint, true);
  });

  it('4. Baseball B/S/O lights auto-cycle on 4-ball walk, 3-strike out, and half-inning switch', () => {
    let sb = createInitialScoreboardState(
      { id: 'M1', topTeam: { id: 'A' }, bottomTeam: { id: 'B' } },
      { sport: 'BASEBALL', bestOf: 1 }
    );

    // 3 balls -> 4th ball resets count
    sb = applyBaseballPitchAction(sb, 'BALL').state;
    sb = applyBaseballPitchAction(sb, 'BALL').state;
    sb = applyBaseballPitchAction(sb, 'STRIKE').state;
    sb = applyBaseballPitchAction(sb, 'BALL').state;
    assert.equal(sb.balls, 3);
    assert.equal(sb.strikes, 1);
    const walkRes = applyBaseballPitchAction(sb, 'BALL');
    sb = walkRes.state;
    assert.equal(sb.balls, 0);
    assert.equal(sb.strikes, 0);
    assert.match(walkRes.notification, /四壞球保送/);

    // 3 strikes -> +1 out
    sb = applyBaseballPitchAction(sb, 'STRIKE').state;
    sb = applyBaseballPitchAction(sb, 'STRIKE').state;
    sb = applyBaseballPitchAction(sb, 'STRIKE').state;
    assert.equal(sb.outs, 1);
    assert.equal(sb.strikes, 0);

    // Switch side: 1局上 -> 1局下 -> 2局上
    sb = applyBaseballPitchAction(sb, 'SWITCH_SIDE').state;
    assert.equal(sb.currentInning, 0);
    assert.equal(sb.half, 'bottom');
    sb = applyBaseballPitchAction(sb, 'SWITCH_SIDE').state;
    assert.equal(sb.currentInning, 1);
    assert.equal(sb.half, 'top');
  });

  it('5. summarizeScoreboardToMatchResult blocks tie finalization in Elimination but permits interim sync', () => {
    const bball = createInitialScoreboardState(
      { id: 'M1', topTeam: { id: 'A' }, bottomTeam: { id: 'B' } },
      { sport: 'BASKETBALL', bestOf: 1 }
    );
    bball.periodScores[0] = { a: 22, b: 22 };
    bball.currentPeriod = 1;

    // Interim progress sync succeeds and produces liveMeta
    const interim = summarizeScoreboardToMatchResult(bball, 'SINGLE', false);
    assert.equal(interim.error, null);
    assert.equal(interim.result.liveMeta, 'Q2 (22:22)');

    // Finalizing tied match in Single Elimination returns clear OT prompt error
    const finTie = summarizeScoreboardToMatchResult(bball, 'SINGLE', true);
    assert.ok(finTie.error);
    assert.match(finTie.error, /OT延長|延長/);
  });

  it('6. Basketball Best-of-3 (3戰2勝) supports full scoreboard for Game 1, Game 2, and Game 3 across separate sessions', () => {
    // Organizer changes match to 3戰2勝 (overrideBestOf = 3)
    const matchG1 = {
      id: 'S1-R1-M1',
      topTeam: { id: 'T1', name: '烈焰勇士', score: null, isWinner: false },
      bottomTeam: { id: 'T2', name: '疾風老鷹', score: null, isWinner: false },
      setScores: [],
    };

    // --- Game 1 ---
    let sb1 = createInitialScoreboardState(matchG1, { sport: 'BASKETBALL', bestOf: 1 }, 3);
    assert.equal(sb1.rules.bestOf, 3);
    assert.equal(evaluateSeriesProgress(sb1).currentGameNumber, 1);

    sb1.periodScores = [
      { a: 20, b: 18 },
      { a: 22, b: 20 },
      { a: 19, b: 21 },
      { a: 21, b: 17 },
    ]; // 82 : 76
    const prog1 = evaluateSeriesProgress(sb1);
    assert.equal(prog1.canFinishCurrentGame, true);
    assert.equal(prog1.canFinalizeSeriesNow, false); // Only 1 win so far, needs 2!

    // Scorer saves Game 1 and exits so Game 2 can be played later
    const afterG1 = advanceSeriesToNextGame(sb1);
    const savedG1 = summarizeScoreboardToMatchResult(afterG1, 'SINGLE', false);
    assert.equal(savedG1.error, null);
    assert.equal(savedG1.result.scoreA, 1);
    assert.equal(savedG1.result.scoreB, 0);
    assert.equal(savedG1.result.customBestOf, 3);
    assert.equal(savedG1.result.topIsWinner, false);
    assert.equal(savedG1.result.setScores.length, 1);
    assert.equal(savedG1.result.setScores[0].a, 82);
    assert.equal(savedG1.result.setScores[0].b, 76);
    assert.equal(savedG1.result.setScores[0].breakdown.length, 4);
    assert.match(savedG1.result.liveMeta, /系列賽 1:0/);

    // --- Game 2 (opened later on another tablet from saved match state!) ---
    const matchG2 = {
      ...matchG1,
      customBestOf: savedG1.result.customBestOf,
      setScores: savedG1.result.setScores,
      topTeam: { ...matchG1.topTeam, score: 1 },
      bottomTeam: { ...matchG1.bottomTeam, score: 0 },
    };
    let sb2 = createInitialScoreboardState(matchG2, { sport: 'BASKETBALL', bestOf: 1 });
    assert.equal(sb2.rules.bestOf, 3);
    assert.equal(sb2.completedSets.length, 1);
    assert.deepEqual(getCurrentGameTotals(sb2), { a: 0, b: 0 }); // Fresh 0:0 scoreboard for Game 2!
    assert.equal(evaluateSeriesProgress(sb2).currentGameNumber, 2);

    // Team B wins Game 2 (75 : 81) -> Series tied 1:1, transitions straight to Game 3
    sb2.periodScores[0] = { a: 75, b: 81 };
    let sb3 = advanceSeriesToNextGame(sb2);
    assert.equal(sb3.completedSets.length, 2);
    assert.deepEqual(getCurrentGameTotals(sb3), { a: 0, b: 0 }); // Fresh 0:0 scoreboard for Game 3!
    const prog3Start = evaluateSeriesProgress(sb3);
    assert.equal(prog3Start.completedWinsA, 1);
    assert.equal(prog3Start.completedWinsB, 1);
    assert.equal(prog3Start.currentGameNumber, 3);

    // --- Game 3 (Deciding Game: Team A leads 90 : 84) ---
    sb3.periodScores[0] = { a: 90, b: 84 };
    const prog3End = evaluateSeriesProgress(sb3);
    assert.equal(prog3End.canFinalizeSeriesNow, true);
    assert.equal(prog3End.projectedWinsA, 2);
    assert.equal(prog3End.projectedWinsB, 1);

    const finalSeries = summarizeScoreboardToMatchResult(sb3, 'SINGLE', true);
    assert.equal(finalSeries.error, null);
    assert.equal(finalSeries.result.scoreA, 2);
    assert.equal(finalSeries.result.scoreB, 1);
    assert.equal(finalSeries.result.topIsWinner, true);
    assert.equal(finalSeries.result.customBestOf, 3);
    assert.equal(finalSeries.result.setScores.length, 3);

    // Verify Official PDF Match Record builder preserves all 3 games & per-game Q1-Q4 breakdowns
    const finalizedMatchObj = {
      ...matchG1,
      customBestOf: 3,
      setScores: finalSeries.result.setScores,
      topTeam: { ...matchG1.topTeam, score: 2, isWinner: true },
      bottomTeam: { ...matchG1.bottomTeam, score: 1, isWinner: false },
    };
    const seriesRecord = buildMatchRecordData({
      match: finalizedMatchObj,
      stage: { id: 1, name: '八強決賽', config: { sport: 'BASKETBALL', format: 'SINGLE', bestOf: 1 } },
      tournamentTitle: '2026全國公開賽',
      deviceName: '第一場地平板',
      customMeta: { court: 'A場地', referee: '陳大華' },
    });
    assert.equal(seriesRecord.statusType, 'COMPLETED');
    assert.equal(seriesRecord.winnerName, '烈焰勇士');
    assert.equal(seriesRecord.teamA.headlineScore, '2');
    assert.equal(seriesRecord.teamB.headlineScore, '1');
    assert.equal(seriesRecord.subGames.length, 3);
    assert.equal(seriesRecord.court, 'A場地');
    assert.equal(seriesRecord.referee, '陳大華');
    assert.match(seriesRecord.suggestedFilename, /2026全國公開賽_八強決賽/);
  });

  it('7. buildMatchRecordData formats Pickleball sets, Forfeit outcomes, and Pre-Match blank scoresheets accurately', () => {
    const stage = {
      id: 1,
      name: '第一階段',
      config: { sport: 'PICKLEBALL', format: 'SINGLE', bestOf: 3 },
    };

    // (a) Straight-sets 2:0 Pickleball completed match -> 3rd set column gracefully displays "—"
    const completedPickle = {
      id: 'S1-R1-M2',
      roundIndex: 0,
      topTeam: { id: 'P1', name: '閃電雙雄', score: 2, isWinner: true, isSeed: true },
      bottomTeam: { id: 'P2', name: '旋風搭檔', score: 0, isWinner: false },
      setScores: [
        { a: 11, b: 8 },
        { a: 11, b: 6 },
      ],
    };
    const recCompleted = buildMatchRecordData({
      match: completedPickle,
      stage,
      tournamentTitle: '城市匹克球盃',
    });
    assert.equal(recCompleted.statusType, 'COMPLETED');
    assert.equal(recCompleted.columns.length, 5); // 第1局, 第2局, 第3局, 勝局數, 總得分合計
    assert.equal(recCompleted.columns[0].valA, '11');
    assert.equal(recCompleted.columns[2].valA, '—'); // Unplayed 3rd set
    assert.equal(recCompleted.columns[3].valA, '2'); // 勝局
    assert.equal(recCompleted.columns[4].valA, '22'); // 總得分 11+11=22

    // (b) Blank Pre-Match sheet (before match starts) -> empty cells ready for handwriting
    const unplayedMatch = {
      id: 'S1-R1-M3',
      roundIndex: 0,
      topTeam: { id: 'P3', name: '藍鯨隊', score: null },
      bottomTeam: { id: 'P4', name: '白鯊隊', score: null },
      setScores: [],
    };
    const recBlank = buildMatchRecordData({
      match: unplayedMatch,
      stage,
      tournamentTitle: '城市匹克球盃',
    });
    assert.equal(recBlank.statusType, 'PRE_MATCH');
    assert.equal(recBlank.columns[0].valA, '');

    // (c) Forfeit match
    const forfeitMatch = {
      id: 'S1-R1-M4',
      roundIndex: 0,
      topTeam: { id: 'P5', name: '紅鷹隊', score: null, isForfeit: true, isWinner: false },
      bottomTeam: { id: 'P6', name: '銀狼隊', score: null, isForfeit: false, isWinner: true },
      setScores: [],
    };
    const recForfeit = buildMatchRecordData({
      match: forfeitMatch,
      stage,
      tournamentTitle: '城市匹克球盃',
    });
    assert.equal(recForfeit.statusType, 'FORFEIT');
    assert.equal(recForfeit.winnerName, '銀狼隊');
    assert.equal(recForfeit.teamA.headlineScore, '棄權');
    assert.equal(recForfeit.teamB.headlineScore, '勝');
  });
});
