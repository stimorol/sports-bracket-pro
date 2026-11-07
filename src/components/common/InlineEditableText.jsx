import React, { useState, useRef, useEffect } from 'react';

/**
 * 支援中文輸入法安全送出 (ime-safe-enter-submit) 的行內編輯文字元件
 * 用於：賽事總標題、階段名稱、以及賽中直接修改隊名
 */
export const InlineEditableText = ({
  value,
  onSave,
  disabled = false,
  label = '編輯名稱',
  textClassName = 'text-xl font-bold text-stone-800',
  inputClassName = 'text-lg font-bold px-2.5 py-1 border border-orange-400 rounded-lg bg-white text-stone-800',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // IME-safe check (modern-web-guidance `ime-safe-enter-submit` Strategy 1)
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      commit();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setDraft(value);
      setIsEditing(false);
    }
  };

  if (disabled) {
    return <span className={textClassName}>{value}</span>;
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={inputClassName}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      aria-label={`${label}：${value}`}
      className={`group inline-flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 hover:bg-stone-100 transition-colors ${textClassName}`}
    >
      <span>{value}</span>
      <i
        className="fa-solid fa-pen text-xs text-stone-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
        aria-hidden="true"
      ></i>
    </button>
  );
};
