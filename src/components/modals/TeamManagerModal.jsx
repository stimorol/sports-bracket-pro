import React, { useEffect, useState } from 'react';
import { ModalDialog } from '../common/ModalDialog';

/**
 * 賽中免清空比分直接修改隊名視窗
 */
export const TeamManagerModal = ({
  isOpen,
  onClose,
  participants,
  onRenameTeam,
}) => {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (isOpen && participants) {
      const map = {};
      participants.forEach((p) => {
        map[p.id] = p.name;
      });
      setDrafts(map);
    }
  }, [isOpen, participants]);

  const handleSaveOne = (id, originalName) => {
    const next = (drafts[id] || '').trim();
    if (next && next !== originalName) {
      onRenameTeam(id, next);
    } else if (!next) {
      setDrafts((prev) => ({ ...prev, [id]: originalName }));
    }
  };

  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} closedBy="any" widthClass="w-full max-w-lg">
      {({ titleId }) => (
        <div className="flex flex-col max-h-[85vh]">
          <div className="bg-stone-800 text-white px-6 py-4 flex justify-between items-center">
            <h2 id={titleId} className="text-lg font-extrabold flex items-center">
              <i className="fa-solid fa-users-gear mr-2.5 text-orange-400" aria-hidden="true"></i>
              參賽隊伍更名管理（保留所有比分）
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉隊伍更名視窗"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-3">
            <p className="text-xs text-stone-600 bg-stone-100 p-3 rounded-xl">
              直接修改下方隊伍名稱後按 Enter 或點擊外部即自動生效，本階段所有賽程卡與積分榜會同步更新，<strong>不會清除任何既有比賽分數</strong>。
            </p>
            <div className="space-y-2.5">
              {(participants || []).map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-7 text-right text-xs font-mono font-bold text-stone-500">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    aria-label={`第 ${idx + 1} 隊名稱`}
                    value={drafts[p.id] ?? p.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    onBlur={() => handleSaveOne(p.id, p.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.isComposing || e.keyCode === 229) return;
                        handleSaveOne(p.id, p.name);
                        e.currentTarget.blur();
                      }
                    }}
                    className="flex-grow min-h-[42px] px-3.5 py-2 border border-stone-300 rounded-xl text-sm font-bold text-stone-800 bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 min-h-[44px] bg-stone-800 hover:bg-stone-900 text-white text-sm font-bold rounded-xl transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
};
