import React, { useId, useState } from 'react';
import { PICKLEBALL_SCORING_MODES, SPORTS } from '../../constants/sports';
import {
  createEmptyStats,
  generateUUID,
  getNextPowerOfTwo,
} from '../../utils/tournamentEngine';
import { InlineEditableText } from '../common/InlineEditableText';

const SAMPLE_TEAMS = [
  '烈焰勇士隊',
  '疾風老鷹隊',
  '雷霆戰狼隊',
  '鋼鐵巨熊隊',
  '蒼穹飛龍隊',
  '星光獵豹隊',
  '極光海豚隊',
  '黃金雄獅隊',
];

export const SetupPanel = ({
  onGenerate,
  participants,
  setParticipants,
  config,
  setConfig,
  onUpdate,
  isInitial,
  onNotify,
  onOpenCloudSetup,
  hasCloudConnected = false,
}) => {
  const formId = useId();
  const [inputValue, setInputValue] = useState('');

  const totalCount = participants.length;
  const bracketSize = totalCount >= 2 ? getNextPowerOfTwo(totalCount) : 2;
  const totalByes = Math.max(0, bracketSize - totalCount);
  const currentSeeds = participants.filter((p) => p.isSeed).length;
  // 若恰好為 2 的次方（無輪空），仍允許設定最多 bracketSize / 2 個種子以固定標準種子籤位（#1、#2 分處左右半區）
  const maxAllowedSeeds = totalByes > 0 ? totalByes : Math.max(2, Math.floor(bracketSize / 2));
  const isSeedLimitReached = currentSeeds >= maxAllowedSeeds;

  const addNames = (rawNames) => {
    const names = rawNames
      .map((n) => n.trim())
      .filter((n) => n !== '');
    if (names.length === 0) return;

    const existingNames = new Set(participants.map((p) => p.name));
    const currentLen = participants.length;
    const groupCount = config.groupCount || 1;

    const newParticipants = names.map((baseName, i) => {
      let uniqueName = baseName;
      let suffix = 2;
      while (existingNames.has(uniqueName)) {
        uniqueName = `${baseName} (${suffix++})`;
      }
      existingNames.add(uniqueName);

      return {
        id: generateUUID(),
        name: uniqueName,
        isSeed: false,
        groupId: String.fromCharCode(65 + ((currentLen + i) % groupCount)),
        stats: createEmptyStats(),
      };
    });

    setParticipants([...participants, ...newParticipants]);
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      onNotify?.('請先在輸入框填寫至少一支隊伍名稱', 'warning');
      return;
    }
    addNames(inputValue.split('\n'));
    setInputValue('');
  };

  const handleLoadSample = () => {
    addNames(SAMPLE_TEAMS);
    onNotify?.('已帶入 8 支範例隊伍名單！', 'info');
  };

  const updateGroupCount = (count) => {
    const newCount = Math.max(1, Math.min(8, count));
    const newParticipants = participants.map((p, i) => ({
      ...p,
      groupId: String.fromCharCode(65 + (i % newCount)),
    }));
    if (onUpdate) {
      onUpdate({
        config: { ...config, groupCount: newCount },
        participants: newParticipants,
      });
    } else {
      setConfig({ ...config, groupCount: newCount });
      setParticipants(newParticipants);
    }
  };

  const toggleSeed = (id) => {
    const target = participants.find((x) => x.id === id);
    if (!target) return;
    if (config.format !== 'ROUND_ROBIN' && !target.isSeed && isSeedLimitReached) {
      onNotify?.(
        totalByes > 0
          ? `目前已達輪空種子上限（${bracketSize} 強籤表共 ${totalByes} 個輪空種子名額）`
          : `目前已達種子上限（最多可指定 ${maxAllowedSeeds} 支種子隊固定籤位）`,
        'warning'
      );
      return;
    }
    setParticipants(
      participants.map((p) => (p.id === id ? { ...p, isSeed: !p.isSeed } : p))
    );
  };

  const changeGroup = (id, delta) => {
    const p = participants.find((x) => x.id === id);
    if (!p) return;
    const currentCode = (p.groupId || 'A').charCodeAt(0);
    let newCode = currentCode + delta;
    if (newCode < 65) newCode = 65 + config.groupCount - 1;
    if (newCode >= 65 + config.groupCount) newCode = 65;
    setParticipants(
      participants.map((x) =>
        x.id === id ? { ...x, groupId: String.fromCharCode(newCode) } : x
      )
    );
  };

  const handleRenameOne = (id, newName) => {
    setParticipants(
      participants.map((x) => (x.id === id ? { ...x, name: newName } : x))
    );
  };

  const handleSportChange = (sportId) => {
    const sport = SPORTS[sportId];
    setConfig({
      ...config,
      sport: sportId,
      bestOf: sport.type === 'sets' ? sport.defaultBestOf || 3 : 1,
      pickleballScoringMode:
        sportId === 'PICKLEBALL'
          ? config.pickleballScoringMode || 'SIDEOUT_DOUBLES'
          : config.pickleballScoringMode,
      pickleballTargetPoints:
        sportId === 'PICKLEBALL'
          ? config.pickleballTargetPoints || 11
          : config.pickleballTargetPoints,
      soccerHalfMinutes:
        sportId === 'FUTSAL' || sportId === 'SOCCER'
          ? sport.defaultRules?.halfMinutes || 20
          : config.soccerHalfMinutes,
    });
  };

  const handleShuffle = () => {
    const copy = [...participants];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setParticipants(copy);
    onNotify?.('已隨機抽籤重排隊伍順序（種子隊仍優先分配至種子籤位）', 'info');
  };

  return (
    <section
      aria-labelledby={`${formId}-heading`}
      className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-stone-200 mb-8 max-w-6xl w-full mx-auto animate-fade-in mt-6"
    >
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shadow-sm shrink-0"
              aria-hidden="true"
            >
              <i className="fa-solid fa-sliders text-lg"></i>
            </span>
            <div>
              <h2
                id={`${formId}-heading`}
                className="text-xl sm:text-2xl font-extrabold text-stone-800 tracking-tight"
              >
                {isInitial ? '初始賽事設定' : '下一階段賽事設定'}
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                選擇運動項目、賽制規則與種子排序，系統將自動推算標準籤表與輪空位置
              </p>
            </div>
          </div>

          {isInitial && onOpenCloudSetup && (
            <button
              type="button"
              onClick={onOpenCloudSetup}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold border flex items-center gap-2 transition-colors shadow-sm ${
                hasCloudConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
              }`}
            >
              <i className="fa-brands fa-google-drive text-emerald-600" aria-hidden="true"></i>
              <span>
                {hasCloudConnected
                  ? '已連結雲端試算表（點此管理或載入既有賽事）'
                  : '連結 Google 試算表範本（多平板同步／載入舊賽程）'}
              </span>
            </button>
          )}
        </div>

        {/* 三欄主設定 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label
              htmlFor={`${formId}-sport`}
              className="block text-sm font-bold text-stone-700 mb-1.5"
            >
              運動種類
            </label>
            <div className="relative">
              <select
                id={`${formId}-sport`}
                name="sport"
                value={config.sport}
                onChange={(e) => handleSportChange(e.target.value)}
                className="w-full min-h-[48px] p-3 pl-10 border border-stone-300 rounded-xl bg-stone-50 focus:bg-white text-stone-800 font-semibold appearance-none transition-colors shadow-sm"
              >
                {Object.values(SPORTS).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-600 pointer-events-none"
                aria-hidden="true"
              >
                <i className={`fa-solid ${SPORTS[config.sport]?.icon || 'fa-trophy'}`}></i>
              </div>
              <div
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none text-xs"
                aria-hidden="true"
              >
                <i className="fa-solid fa-chevron-down"></i>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor={`${formId}-format`}
              className="block text-sm font-bold text-stone-700 mb-1.5"
            >
              本階段賽制
            </label>
            <div className="relative">
              <select
                id={`${formId}-format`}
                name="format"
                value={config.format}
                onChange={(e) => setConfig({ ...config, format: e.target.value })}
                className="w-full min-h-[48px] p-3 pr-9 border border-stone-300 rounded-xl bg-stone-50 focus:bg-white text-stone-800 font-semibold appearance-none transition-colors shadow-sm"
              >
                <option value="SINGLE">單淘汰制 (Single Elimination)</option>
                <option value="DOUBLE">雙敗淘汰制 (Double Elimination)</option>
                <option value="ROUND_ROBIN">分組循環賽制 (Round Robin)</option>
              </select>
              <div
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none text-xs"
                aria-hidden="true"
              >
                <i className="fa-solid fa-chevron-down"></i>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor={`${formId}-bestof`}
              className="block text-sm font-bold text-stone-700 mb-1.5"
            >
              預設決勝機制（單場可個別調整）
            </label>
            <div className="relative">
              <select
                id={`${formId}-bestof`}
                name="bestOf"
                value={config.bestOf}
                onChange={(e) =>
                  setConfig({ ...config, bestOf: parseInt(e.target.value, 10) })
                }
                className="w-full min-h-[48px] p-3 pr-9 border border-stone-300 rounded-xl bg-stone-50 focus:bg-white text-stone-800 font-semibold appearance-none transition-colors shadow-sm"
              >
                <option value={1}>1 戰定勝負（單場總分）</option>
                <option value={3}>3 戰 2 勝制</option>
                <option value={5}>5 戰 3 勝制</option>
                <option value={7}>7 戰 4 勝制</option>
              </select>
              <div
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none text-xs"
                aria-hidden="true"
              >
                <i className="fa-solid fa-chevron-down"></i>
              </div>
            </div>
          </div>
        </div>

        {/* 依賽制動態呈現進階選項 */}
        <div className="flex flex-wrap gap-4 items-center">
          {config.format === 'ROUND_ROBIN' && (
            <div className="flex items-center gap-3 bg-stone-100 px-3.5 py-2 rounded-xl border border-stone-200">
              <span className="text-sm font-bold text-stone-700">分組數量：</span>
              <div className="flex items-center bg-white rounded-lg shadow-sm border border-stone-300 overflow-hidden">
                <button
                  type="button"
                  aria-label="減少分組數量"
                  disabled={config.groupCount <= 1}
                  onClick={() => updateGroupCount(config.groupCount - 1)}
                  className="w-10 h-10 text-stone-700 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40 transition-colors border-r border-stone-200 font-bold"
                >
                  −
                </button>
                <span
                  aria-live="polite"
                  className="w-12 text-center font-extrabold text-stone-800"
                >
                  {config.groupCount} 組
                </span>
                <button
                  type="button"
                  aria-label="增加分組數量"
                  disabled={config.groupCount >= 8}
                  onClick={() => updateGroupCount(config.groupCount + 1)}
                  className="w-10 h-10 text-stone-700 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40 transition-colors border-l border-stone-200 font-bold"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* 修正：季軍加賽僅適用於單淘汰制（雙敗淘汰自然由敗部決賽產生季軍） */}
          {config.format === 'SINGLE' && (
            <label
              htmlFor={`${formId}-third-place`}
              className="flex items-center gap-3 bg-amber-50 border border-amber-300/80 px-4 py-2.5 min-h-[48px] rounded-xl cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
            >
              <input
                type="checkbox"
                id={`${formId}-third-place`}
                checked={Boolean(config.hasThirdPlace)}
                onChange={(e) =>
                  setConfig({ ...config, hasThirdPlace: e.target.checked })
                }
                className="w-5 h-5 accent-orange-600 rounded cursor-pointer"
              />
              <span className="text-sm font-bold text-amber-900">
                包含季軍 / 殿軍排名賽（4 隊以上生效）
              </span>
            </label>
          )}

          {/* 新增：標準雙敗淘汰總冠軍加賽 (Bracket Reset) 選項 */}
          {config.format === 'DOUBLE' && (
            <label
              htmlFor={`${formId}-bracket-reset`}
              className="flex items-start sm:items-center gap-3 bg-orange-50 border border-orange-300/80 px-4 py-2.5 min-h-[48px] rounded-xl cursor-pointer hover:bg-orange-100/60 transition-colors select-none"
            >
              <input
                type="checkbox"
                id={`${formId}-bracket-reset`}
                checked={config.hasBracketReset !== false}
                onChange={(e) =>
                  setConfig({ ...config, hasBracketReset: e.target.checked })
                }
                className="w-5 h-5 accent-orange-600 rounded cursor-pointer mt-0.5 sm:mt-0 shrink-0"
              />
              <div>
                <span className="text-sm font-bold text-orange-950 block">
                  啟用標準雙敗「總冠軍驟死加賽 (Bracket Reset)」
                </span>
                <span className="text-xs text-stone-600 block">
                  若全勝的勝部冠軍於總決賽首場落敗（雙方同為一敗），將自動啟動最終加賽決定總冠軍；取消勾選則採單場總決賽定勝負。
                </span>
              </div>
            </label>
          )}
        </div>

        {/* 匹克球專屬：發球得分制 vs 落地得分制 (依循 modern-web-guidance `forms`：選項 < 6 個時直接展開為可見 radio 按鈕組！) */}
        {config.sport === 'PICKLEBALL' && (
          <div className="bg-emerald-50/70 border-2 border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-extrabold text-emerald-950 flex items-center gap-2">
                <i className="fa-solid fa-baseball text-emerald-600" aria-hidden="true"></i>
                匹克球計分方式（全場預設，進入場邊數位記分板仍可單場微調）
              </legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {Object.values(PICKLEBALL_SCORING_MODES).map((mode) => {
                  const currentMode = config.pickleballScoringMode || 'SIDEOUT_DOUBLES';
                  const checked = currentMode === mode.id;
                  const radioId = `${formId}-pb-mode-${mode.id}`;
                  return (
                    <label
                      key={mode.id}
                      htmlFor={radioId}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${
                        checked
                          ? 'bg-white border-emerald-600 shadow-sm'
                          : 'bg-white/70 border-emerald-200/80 hover:border-emerald-400'
                      }`}
                    >
                      <input
                        type="radio"
                        id={radioId}
                        name="pickleballScoringMode"
                        value={mode.id}
                        checked={checked}
                        onChange={() => {
                          const nextTarget =
                            mode.id === 'RALLY' && (!config.pickleballTargetPoints || config.pickleballTargetPoints === 11)
                              ? 15
                              : config.pickleballTargetPoints || 11;
                          setConfig({
                            ...config,
                            pickleballScoringMode: mode.id,
                            pickleballTargetPoints: nextTarget,
                          });
                        }}
                        className="w-4 h-4 mt-1 accent-emerald-600 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold text-stone-900">
                          {mode.label}
                        </div>
                        <div className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                          {mode.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="flex flex-wrap items-center gap-3 pt-1 border-t border-emerald-200/70">
              <legend className="text-xs sm:text-sm font-extrabold text-emerald-950 mr-2 float-left">
                單局目標分數：
              </legend>
              {[11, 15, 21].map((pts) => {
                const activePts = Number(config.pickleballTargetPoints || 11);
                const checked = activePts === pts;
                const ptId = `${formId}-pb-pts-${pts}`;
                return (
                  <label
                    key={pts}
                    htmlFor={ptId}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer inline-flex items-center gap-2 transition-colors ${
                      checked
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-stone-700 border-emerald-300 hover:bg-emerald-100/60'
                    }`}
                  >
                    <input
                      type="radio"
                      id={ptId}
                      name="pickleballTargetPoints"
                      value={pts}
                      checked={checked}
                      onChange={() =>
                        setConfig({ ...config, pickleballTargetPoints: pts })
                      }
                      className="w-3.5 h-3.5 accent-white"
                    />
                    <span>{pts} 分制 (Deuce 贏 2 分)</span>
                  </label>
                );
              })}
            </fieldset>
          </div>
        )}

        {/* 足球／五人制足球專屬：單半場時間與淘汰賽 PK 點球提示 */}
        {(config.sport === 'FUTSAL' || config.sport === 'SOCCER') && (
          <div className="bg-sky-50/70 border-2 border-sky-200 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <fieldset className="flex flex-wrap items-center gap-2.5">
              <legend className="text-xs sm:text-sm font-extrabold text-sky-950 mr-2 flex items-center gap-1.5 float-left">
                <i className="fa-solid fa-futbol text-sky-700" aria-hidden="true"></i>
                {config.sport === 'FUTSAL'
                  ? '五人制足球單半場時間（含單半場滿 5 犯第二罰球點提示）：'
                  : '足球單半場時間（上下半場制）：'}
              </legend>
              {(config.sport === 'FUTSAL' ? [8, 10, 12, 15, 20] : [15, 20, 25, 30, 45]).map(
                (mins) => {
                  const defaultMins =
                    SPORTS[config.sport]?.defaultRules?.halfMinutes || 20;
                  const activeMins = Number(config.soccerHalfMinutes || defaultMins);
                  const checked = activeMins === mins;
                  const mId = `${formId}-soccer-min-${mins}`;
                  return (
                    <label
                      key={mins}
                      htmlFor={mId}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
                        checked
                          ? 'bg-sky-700 text-white border-sky-700 shadow-sm'
                          : 'bg-white text-stone-700 border-sky-300 hover:bg-sky-100/60'
                      }`}
                    >
                      <input
                        type="radio"
                        id={mId}
                        name="soccerHalfMinutes"
                        value={mins}
                        checked={checked}
                        onChange={() =>
                          setConfig({ ...config, soccerHalfMinutes: mins })
                        }
                        className="w-3.5 h-3.5 accent-white"
                      />
                      <span>{mins} 分鐘</span>
                    </label>
                  );
                }
              )}
            </fieldset>

            <div className="text-xs text-sky-900 font-semibold bg-white/80 px-3 py-2 rounded-xl border border-sky-200">
              ⚽ 淘汰賽若正規／延長時間平手，記分板與成績登錄均支援直接輸入 <strong>PK 點球大戰比分</strong> 晉級！
            </div>
          </div>
        )}
      </div>

      {/* 名單輸入與管理雙欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {isInitial && (
          <form onSubmit={handleAddSubmit} className="flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <label
                htmlFor={`${formId}-team-textarea`}
                className="text-sm font-bold text-stone-700"
              >
                批次輸入參賽隊伍（每行一隊）
              </label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline px-2 py-1 rounded"
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-1" aria-hidden="true"></i>
                帶入 8 隊範例
              </button>
            </div>
            <textarea
              id={`${formId}-team-textarea`}
              name="teamNames"
              className="w-full p-4 border border-stone-300 rounded-xl bg-stone-50 focus:bg-white min-h-[250px] text-base font-mono text-stone-800 shadow-sm transition-colors resize-y"
              placeholder={'請輸入隊伍名稱（每行一隊）\n例如：\n烈焰勇士隊\n疾風老鷹隊\n雷霆戰狼隊'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <button
              type="submit"
              className="mt-3 min-h-[48px] px-5 py-2.5 bg-stone-800 text-white rounded-xl hover:bg-stone-900 text-sm font-bold shadow transition-colors flex items-center justify-center"
            >
              <i className="fa-solid fa-plus mr-2" aria-hidden="true"></i>
              加入參賽名單
            </button>
          </form>
        )}

        <div className={`flex flex-col h-full ${!isInitial ? 'lg:col-span-2' : ''}`}>
          <div className="flex flex-wrap justify-between items-center mb-2.5 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold text-stone-800">
                已加入：{totalCount} 隊
              </span>
              {totalCount >= 2 && config.format !== 'ROUND_ROBIN' && (
                <div
                  className={`text-xs flex items-center px-2.5 py-1 rounded-full border font-medium ${
                    isSeedLimitReached
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-stone-100 text-stone-700 border-stone-300'
                  }`}
                >
                  <i className="fa-solid fa-sitemap mr-1.5" aria-hidden="true"></i>
                  {bracketSize} 強籤表
                  <span className="mx-1.5 opacity-40">|</span>
                  輪空：{totalByes}
                  <span className="mx-1.5 opacity-40">|</span>
                  <span className="font-bold text-orange-700">
                    種子：{currentSeeds}/{maxAllowedSeeds}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={participants.length < 2}
                onClick={handleShuffle}
                className="text-xs min-h-[36px] px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg font-bold shadow-sm disabled:opacity-40 transition-colors"
              >
                <i className="fa-solid fa-shuffle mr-1.5" aria-hidden="true"></i>
                隨機抽籤排序
              </button>
              {isInitial && participants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setParticipants([])}
                  className="text-xs min-h-[36px] px-3 py-1.5 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-lg font-bold shadow-sm transition-colors"
                >
                  清空全部
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-stone-300 rounded-xl overflow-hidden shadow-inner h-[270px] flex flex-col">
            {participants.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-stone-500 text-sm p-6 text-center">
                <i className="fa-solid fa-people-group text-3xl text-stone-300 mb-2" aria-hidden="true"></i>
                <span>尚未加入任何參賽隊伍，請從左側輸入或點擊「帶入 8 隊範例」</span>
              </div>
            ) : (
              <ol className="overflow-y-auto p-1.5 space-y-1 flex-grow">
                {participants.map((p, idx) => (
                  <li
                    key={p.id}
                    className="flex justify-between items-center px-3 py-2 text-sm hover:bg-stone-50 rounded-lg border border-transparent hover:border-stone-200 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 text-stone-500 font-mono text-xs font-bold shrink-0">
                        {idx + 1}.
                      </span>

                      {config.format === 'ROUND_ROBIN' && config.groupCount > 1 && (
                        <div className="flex items-center bg-stone-100 rounded-lg p-0.5 shrink-0 border border-stone-200">
                          <button
                            type="button"
                            aria-label={`將 ${p.name} 切換至上一分組`}
                            onClick={() => changeGroup(p.id, -1)}
                            className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-orange-700 rounded"
                          >
                            <i className="fa-solid fa-caret-left" aria-hidden="true"></i>
                          </button>
                          <span className="px-2 py-0.5 bg-white text-orange-700 font-extrabold rounded text-xs shadow-sm">
                            {p.groupId}組
                          </span>
                          <button
                            type="button"
                            aria-label={`將 ${p.name} 切換至下一分組`}
                            onClick={() => changeGroup(p.id, 1)}
                            className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-orange-700 rounded"
                          >
                            <i className="fa-solid fa-caret-right" aria-hidden="true"></i>
                          </button>
                        </div>
                      )}

                      <InlineEditableText
                        value={p.name}
                        onSave={(nextName) => handleRenameOne(p.id, nextName)}
                        label={`修改隊名`}
                        textClassName="font-bold text-stone-800 truncate text-sm"
                        inputClassName="text-sm font-bold px-2 py-0.5 border border-orange-400 rounded bg-white text-stone-800 w-36 sm:w-48"
                      />

                      {p.isSeed && config.format !== 'ROUND_ROBIN' && (
                        <span className="text-[11px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold border border-orange-300 shrink-0">
                          {totalByes > 0 ? '種子 (優先輪空)' : '種子籤位'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {config.format !== 'ROUND_ROBIN' && (
                        <button
                          type="button"
                          aria-pressed={Boolean(p.isSeed)}
                          aria-label={p.isSeed ? `取消 ${p.name} 的種子資格` : `將 ${p.name} 設為種子隊`}
                          onClick={() => toggleSeed(p.id)}
                          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors border ${
                            p.isSeed
                              ? 'bg-orange-100 text-orange-600 border-orange-300 shadow-sm'
                              : isSeedLimitReached
                                ? 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed'
                                : 'bg-white text-stone-400 border-stone-300 hover:text-orange-600 hover:border-orange-400'
                          }`}
                        >
                          <i className="fa-solid fa-star text-xs" aria-hidden="true"></i>
                        </button>
                      )}
                      {isInitial && (
                        <button
                          type="button"
                          aria-label={`移除隊伍 ${p.name}`}
                          onClick={() =>
                            setParticipants(participants.filter((x) => x.id !== p.id))
                          }
                          className="w-9 h-9 flex items-center justify-center text-stone-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                        >
                          <i className="fa-solid fa-trash-can text-xs" aria-hidden="true"></i>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* 底部啟動按鈕 */}
      <div className="mt-8 pt-6 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-stone-600">
          {participants.length < 2
            ? '請至少加入 2 支參賽隊伍以產生賽程表'
            : `準備就緒！點擊右側按鈕立即產生 ${participants.length} 隊賽程表`}
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={participants.length < 2}
          className="min-h-[52px] px-10 py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-xl font-extrabold shadow-lg hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] transition-all disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center text-base sm:text-lg"
        >
          <i className="fa-solid fa-play mr-2.5" aria-hidden="true"></i>
          {isInitial ? '開始賽事並產生賽程' : '產生本階段賽程'}
        </button>
      </div>
    </section>
  );
};
