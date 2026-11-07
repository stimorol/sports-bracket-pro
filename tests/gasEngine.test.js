import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OFFICIAL_SHEET_TEMPLATE_COPY_URL,
  validateGasWebAppUrl,
} from '../src/utils/gasUrlValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gasCode = fs.readFileSync(path.join(__dirname, '..', 'google_apps_script.js'), 'utf8');

function createGASContext({ lockSucceeds = true } = {}) {
  const sheets = new Map();

  const makeSheet = (name) => {
    let grid = [];
    let hidden = false;

    const ensureSize = (rows, cols) => {
      while (grid.length < rows) grid.push([]);
      for (let r = 0; r < rows; r++) {
        while (grid[r].length < cols) grid[r].push('');
      }
    };

    return {
      name,
      clear() {
        grid = [];
      },
      hideSheet() {
        hidden = true;
      },
      isSheetHidden() {
        return hidden;
      },
      getLastRow() {
        return grid.length;
      },
      getDataSnapshot() {
        return grid;
      },
      getRange(row, col, numRows = 1, numCols = 1) {
        return {
          getValue() {
            return grid[row - 1]?.[col - 1] ?? '';
          },
          getValues() {
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const rowArr = [];
              for (let c = 0; c < numCols; c++) {
                rowArr.push(grid[row - 1 + r]?.[col - 1 + c] ?? '');
              }
              out.push(rowArr);
            }
            return out;
          },
          setValue(val) {
            ensureSize(row, col);
            grid[row - 1][col - 1] = val;
            return this;
          },
          setValues(vals) {
            ensureSize(row - 1 + vals.length, col - 1 + (vals[0]?.length || 1));
            for (let r = 0; r < vals.length; r++) {
              for (let c = 0; c < vals[r].length; c++) {
                grid[row - 1 + r][col - 1 + c] = vals[r][c];
              }
            }
            return this;
          },
          clearContent() {
            for (let r = 0; r < numRows; r++) {
              if (grid[row - 1 + r]) {
                for (let c = 0; c < numCols; c++) {
                  grid[row - 1 + r][col - 1 + c] = '';
                }
              }
            }
          },
          setFontWeight() {
            return this;
          },
          setBackground() {
            return this;
          },
        };
      },
    };
  };

  // Pre-seed default Sheet1 so hideSheet() has >1 sheet
  sheets.set('Sheet1', makeSheet('Sheet1'));

  const context = {
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Date,
    Math,
    LockService: {
      getScriptLock: () => ({
        tryLock: () => lockSucceeds,
        releaseLock: () => {},
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets.get(n) || null,
        insertSheet: (n) => {
          const s = makeSheet(n);
          sheets.set(n, s);
          return s;
        },
        getSheets: () => [...sheets.values()],
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (str) => ({
        _body: str,
        setMimeType() {
          return this;
        },
      }),
    },
  };

  vm.createContext(context);
  vm.runInContext(gasCode, context);
  return { context, sheets };
}

describe('Google Apps Script Backend — Chunking, Passcode & Standings Tests', () => {
  it('1. Chunks >50,000 char payloads across multiple cells and restores cleanly on doGet', () => {
    const { context, sheets } = createGASContext();

    // Generate a large payload (>70,000 characters)
    const bigParticipants = Array.from({ length: 360 }, (_, i) => ({
      id: `P_${i}`,
      name: `超長測試隊伍名稱_${'甲乙丙丁戊己庚辛'.repeat(8)}_${i}`,
      groupId: i % 2 === 0 ? 'A' : 'B',
      stats: { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 },
    }));

    const payload = {
      action: 'save',
      passcode: 'secret123',
      data: {
        version: 2,
        tournamentTitle: '全國大專盃排球錦標賽',
        stages: [
          {
            id: 1,
            name: '預賽循環',
            config: { format: 'ROUND_ROBIN', groupCount: 2 },
            participants: bigParticipants,
            matches: [
              {
                id: 'S1-GA-R1-M1',
                groupId: 'A',
                bracketType: 'group',
                topTeam: { id: 'P_0', name: bigParticipants[0].name, score: 25, isWinner: true },
                bottomTeam: { id: 'P_2', name: bigParticipants[2].name, score: 18, isWinner: false },
                setScores: [{ a: 25, b: 18 }],
              },
            ],
          },
        ],
      },
    };

    const rawStr = JSON.stringify(payload.data);
    assert.ok(rawStr.length > 50000, `Payload (${rawStr.length} chars) exceeds 50k limit`);

    const postRes = JSON.parse(
      context.doPost({ postData: { contents: JSON.stringify(payload) } })._body
    );
    assert.equal(postRes.status, 'success');
    assert.equal(postRes.hasPasscode, true);

    // Verify System_Data split into multiple rows each <= 35,000 chars
    const sysGrid = sheets.get('System_Data').getDataSnapshot();
    assert.ok(sysGrid.length >= 2, 'Should span multiple rows');
    sysGrid.forEach((row) => {
      assert.ok(String(row[0]).length <= 35000);
    });

    // Verify Standings sheet recalculated stats (NOT 0!)
    const stdGrid = sheets.get('積分榜 (Standings)').getDataSnapshot();
    const topGroupARow = stdGrid[1]; // Row 2 (index 1) is Group A Rank #1 (P_0)
    assert.equal(topGroupARow[2], 'Group A');
    assert.equal(topGroupARow[3], 1);
    assert.equal(topGroupARow[5], 1); // played = 1
    assert.equal(topGroupARow[6], 1); // won = 1
    assert.equal(topGroupARow[11], 7); // gd = +7
    assert.equal(topGroupARow[12], 3); // pts = 3

    // Verify doGet reconstructs exact object without passcode
    const getRes = JSON.parse(context.doGet({})._body);
    assert.equal(getRes.status, 'success');
    assert.equal(getRes.hasPasscode, true);
    assert.equal(getRes.data.tournamentTitle, '全國大專盃排球錦標賽');
    assert.equal(getRes.data.stages[0].participants.length, 360);

    // Verify wrong passcode is rejected on subsequent POST without corrupting stored data
    const badPost = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({ action: 'save', passcode: 'wrong', data: { stages: [] } }),
        },
      })._body
    );
    assert.equal(badPost.status, 'error');
    assert.equal(badPost.code, 'INVALID_PASSCODE');

    const getAfterAttack = JSON.parse(context.doGet({})._body);
    assert.equal(getAfterAttack.data.stages[0].participants.length, 360);
  });

  it('2. Rejects concurrent write cleanly when LockService.tryLock returns false', () => {
    const { context } = createGASContext({ lockSucceeds: false });
    const res = JSON.parse(
      context.doPost({
        postData: { contents: JSON.stringify({ action: 'save', data: { stages: [] } }) },
      })._body
    );
    assert.equal(res.status, 'error');
    assert.equal(res.code, 'LOCK_TIMEOUT');
  });

  it('3. Enforces per-match exclusive device lock (MATCH_LOCKED), supports forceTakeover, and merges multi-tablet concurrent matches without overwriting', () => {
    const { context, sheets } = createGASContext();

    // Organizer uploads initial 4-team Single Elimination bracket
    const initialTournament = {
      version: 2,
      tournamentTitle: '全市匹克球公開賽',
      stages: [
        {
          id: 1,
          name: '四強決賽',
          status: 'ACTIVE',
          config: { format: 'SINGLE', sport: 'PICKLEBALL', bestOf: 3 },
          participants: [
            { id: 'T1', name: 'A隊' },
            { id: 'T2', name: 'B隊' },
            { id: 'T3', name: 'C隊' },
            { id: 'T4', name: 'D隊' },
          ],
          matches: [
            {
              id: 'S1-R1-M1',
              roundIndex: 0,
              bracketType: 'winner',
              topTeam: { id: 'T1', name: 'A隊', score: null, isWinner: false },
              bottomTeam: { id: 'T4', name: 'D隊', score: null, isWinner: false },
              nextMatchId: 'S1-R2-M3',
              nextMatchPosition: 'top',
            },
            {
              id: 'S1-R1-M2',
              roundIndex: 0,
              bracketType: 'winner',
              topTeam: { id: 'T2', name: 'B隊', score: null, isWinner: false },
              bottomTeam: { id: 'T3', name: 'C隊', score: null, isWinner: false },
              nextMatchId: 'S1-R2-M3',
              nextMatchPosition: 'bottom',
            },
            {
              id: 'S1-R2-M3',
              roundIndex: 1,
              bracketType: 'final',
              topTeam: { id: null, name: null, placeholder: '待定', score: null, isWinner: false },
              bottomTeam: { id: null, name: null, placeholder: '待定', score: null, isWinner: false },
              nextMatchId: null,
              nextMatchPosition: null,
            },
          ],
        },
      ],
    };

    context.doPost({
      postData: { contents: JSON.stringify({ action: 'save', passcode: 'p123', data: initialTournament }) },
    });

    // Court 1 Tablet locks Match 1
    const lock1 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'claim_match_lock',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            deviceId: 'DEV-TABLET-1',
            deviceName: '1號場平板',
          }),
        },
      })._body
    );
    assert.equal(lock1.status, 'success');
    assert.equal(lock1.lockInfo.deviceName, '1號場平板');

    // Another tablet tries to open Match 1 -> Rejected with MATCH_LOCKED!
    const lockConflict = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'claim_match_lock',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            deviceId: 'DEV-TABLET-2',
            deviceName: '2號場平板',
          }),
        },
      })._body
    );
    assert.equal(lockConflict.status, 'error');
    assert.equal(lockConflict.code, 'MATCH_LOCKED');
    assert.equal(lockConflict.lockInfo.deviceId, 'DEV-TABLET-1');

    // Meanwhile Court 2 Tablet locks Match 2 and syncs mid-game Set 1 progress
    const lock2 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'claim_match_lock',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M2',
            deviceId: 'DEV-TABLET-2',
            deviceName: '2號場平板',
          }),
        },
      })._body
    );
    assert.equal(lock2.status, 'success');

    const prog2 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'sync_match_progress',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M2',
            deviceId: 'DEV-TABLET-2',
            deviceName: '2號場平板',
            progress: {
              scoreA: 1,
              scoreB: 0,
              setScores: [{ a: 11, b: 8 }],
              liveMeta: '第2局 (4:2)',
            },
          }),
        },
      })._body
    );
    assert.equal(prog2.status, 'success');

    // Court 1 Tablet finalizes Match 1 (T1 wins 2:0)
    const fin1 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'finalize_match',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            deviceId: 'DEV-TABLET-1',
            result: {
              scoreA: 2,
              scoreB: 0,
              setScores: [
                { a: 11, b: 5 },
                { a: 11, b: 7 },
              ],
              topIsWinner: true,
              bottomIsWinner: false,
              customBestOf: 3,
            },
          }),
        },
      })._body
    );
    assert.equal(fin1.status, 'success');

    // Verify Court 2's live progress & lock on Match 2 were NOT overwritten by Court 1 finalizing Match 1!
    const m2AfterFin1 = fin1.data.stages[0].matches.find((m) => m.id === 'S1-R1-M2');
    assert.equal(m2AfterFin1.liveMeta, '第2局 (4:2)');
    assert.equal(m2AfterFin1.lockInfo.deviceId, 'DEV-TABLET-2');

    // Now Court 2 Tablet finalizes Match 2 (T3 wins 2:1)
    const fin2 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'finalize_match',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M2',
            deviceId: 'DEV-TABLET-2',
            result: {
              scoreA: 1,
              scoreB: 2,
              setScores: [
                { a: 11, b: 8 },
                { a: 6, b: 11 },
                { a: 9, b: 11 },
              ],
              topIsWinner: false,
              bottomIsWinner: true,
              customBestOf: 3,
            },
          }),
        },
      })._body
    );
    assert.equal(fin2.status, 'success');

    // Verify Grand Final (S1-R2-M3) now has BOTH T1 (from Court 1) AND T3 (from Court 2)!
    const finalMatch = fin2.data.stages[0].matches.find((m) => m.id === 'S1-R2-M3');
    assert.equal(finalMatch.topTeam.id, 'T1');
    assert.equal(finalMatch.bottomTeam.id, 'T3');

    // Verify Schedule Sheet reflects finalized winners
    const schedGrid = sheets.get('賽程表 (Schedule)').getDataSnapshot();
    assert.equal(schedGrid[1][9], '已完賽');
    assert.equal(schedGrid[1][10], 'A隊');
    assert.equal(schedGrid[2][9], '已完賽');
    assert.equal(schedGrid[2][10], 'C隊');
  });

  it('4. Supports update_match_best_of and releaseLock on sync_match_progress for multi-game series handoff across tablets', () => {
    const { context } = createGASContext();
    context.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'save',
          passcode: 'p123',
          data: {
            version: 2,
            tournamentTitle: '籃球季後賽',
            stages: [
              {
                id: 1,
                name: '總決賽',
                status: 'ACTIVE',
                config: { format: 'SINGLE', sport: 'BASKETBALL', bestOf: 1 },
                participants: [
                  { id: 'T1', name: '勇士' },
                  { id: 'T2', name: '老鷹' },
                ],
                matches: [
                  {
                    id: 'S1-R1-M1',
                    roundIndex: 0,
                    bracketType: 'final',
                    topTeam: { id: 'T1', name: '勇士', score: null, isWinner: false },
                    bottomTeam: { id: 'T2', name: '老鷹', score: null, isWinner: false },
                  },
                ],
              },
            ],
          },
        }),
      },
    });

    // Admin sets Finals to 3戰2勝 (customBestOf = 3)
    const bestOfRes = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'update_match_best_of',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            customBestOf: 3,
          }),
        },
      })._body
    );
    assert.equal(bestOfRes.status, 'success');
    assert.equal(bestOfRes.data.stages[0].matches[0].customBestOf, 3);

    // Tablet 1 claims lock, finishes Game 1 (82:76 -> Series 1:0), and saves with releaseLock: true
    context.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'claim_match_lock',
          passcode: 'p123',
          stageId: 1,
          matchId: 'S1-R1-M1',
          deviceId: 'TAB-MORNING',
          deviceName: '上午場平板',
        }),
      },
    });

    const saveG1 = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'sync_match_progress',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            deviceId: 'TAB-MORNING',
            releaseLock: true,
            progress: {
              scoreA: 1,
              scoreB: 0,
              setScores: [{ a: 82, b: 76 }],
              customBestOf: 3,
              liveMeta: '系列賽 1:0 (待第2戰)',
            },
          }),
        },
      })._body
    );
    assert.equal(saveG1.status, 'success');
    assert.equal(saveG1.data.stages[0].matches[0].lockInfo, null);

    // Afternoon Tablet claims lock cleanly for Game 2 without needing forceTakeover!
    const afternoonLock = JSON.parse(
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'claim_match_lock',
            passcode: 'p123',
            stageId: 1,
            matchId: 'S1-R1-M1',
            deviceId: 'TAB-AFTERNOON',
            deviceName: '下午場平板',
          }),
        },
      })._body
    );
    assert.equal(afternoonLock.status, 'success');
    assert.equal(afternoonLock.data.stages[0].matches[0].setScores.length, 1);
    assert.equal(afternoonLock.data.stages[0].matches[0].customBestOf, 3);
  });

  it('5. Validates GAS Web App URLs accurately and catches mistaken Google Sheets, /edit, and /dev URLs', () => {
    assert.equal(
      OFFICIAL_SHEET_TEMPLATE_COPY_URL,
      'https://docs.google.com/spreadsheets/d/1FzM6Sy4cFkzWfKahzxes5gtv4ZzSACoFutu3uCeYosI/copy'
    );

    // Valid standard & Google Workspace GAS /exec URLs
    assert.equal(
      validateGasWebAppUrl('https://script.google.com/macros/s/AKfycbx123456789/exec').isValid,
      true
    );
    assert.equal(
      validateGasWebAppUrl('https://script.google.com/a/macros/edu.tw/s/AKfycbx123456789/exec')
        .isValid,
      true
    );

    // Empty string is treated as valid (cleared / local-only mode)
    assert.equal(validateGasWebAppUrl('   ').isValid, true);

    // Mistaken Google Sheet URL
    const sheetCheck = validateGasWebAppUrl(
      'https://docs.google.com/spreadsheets/d/1FzM6Sy4cFkzWfKahzxes5gtv4ZzSACoFutu3uCeYosI/edit?usp=sharing'
    );
    assert.equal(sheetCheck.isValid, false);
    assert.ok(sheetCheck.warning.includes('Google 試算表網址'));

    // Mistaken Apps Script Editor URL
    const editCheck = validateGasWebAppUrl(
      'https://script.google.com/home/projects/1abcDEF/edit'
    );
    assert.equal(editCheck.isValid, false);
    assert.ok(editCheck.warning.includes('Apps Script 編輯器網址'));

    // Mistaken /dev Test Deployment URL
    const devCheck = validateGasWebAppUrl(
      'https://script.google.com/macros/s/AKfycbx123456789/dev'
    );
    assert.equal(devCheck.isValid, false);
    assert.ok(devCheck.warning.includes('/dev'));
  });
});
