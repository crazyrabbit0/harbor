import { useRef, useState, type KeyboardEvent, type UIEvent } from "react";

export type CodeLang = "css" | "html" | "js";

const RULES: Record<CodeLang, Array<{ cls: string; re: RegExp }>> = {
  css: [
    { cls: "com", re: /\/\*[\s\S]*?\*\// },
    { cls: "str", re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },
    { cls: "at", re: /@[\w-]+/ },
    { cls: "num", re: /#[0-9a-fA-F]{3,8}\b|[-+]?\b[\d.]+(?:px|em|rem|%|vh|vw|fr|s|ms|deg)?\b/ },
    { cls: "prop", re: /[\w-]+(?=\s*:)/ },
    { cls: "punct", re: /[{}();:,]/ },
  ],
  js: [
    { cls: "com", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\// },
    { cls: "str", re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/ },
    {
      cls: "kw",
      re: /\b(?:const|let|var|function|return|if|else|for|while|new|class|extends|import|export|from|await|async|try|catch|finally|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|this|null|true|false|undefined|void)\b/,
    },
    { cls: "num", re: /\b\d[\d.]*\b/ },
    { cls: "punct", re: /[{}()[\];,.]/ },
  ],
  html: [
    { cls: "com", re: /<!--[\s\S]*?-->/ },
    { cls: "str", re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },
    { cls: "tag", re: /<\/?[a-zA-Z][\w-]*|\/?>/ },
    { cls: "attr", re: /[\w-]+(?=\s*=)/ },
  ],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string, lang: CodeLang): string {
  const rules = RULES[lang];
  const re = new RegExp(rules.map((r) => `(${r.re.source})`).join("|"), "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    let cls = "";
    for (let g = 1; g <= rules.length; g++) {
      if (m[g] !== undefined) {
        cls = rules[g - 1].cls;
        break;
      }
    }
    out += `<span class="hc-${cls}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

const BOX = "m-0 border-0 px-4 py-3.5 font-mono text-[15px] leading-[26px] [tab-size:2]";
const LINE_PX = 26;
const PAD_TOP_PX = 14;

export function CodeEditor({
  value,
  onChange,
  language,
  autoFocus,
  onCaret,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  language: CodeLang;
  autoFocus?: boolean;
  onCaret?: (line: number, col: number) => void;
  className?: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [caretLine, setCaretLine] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const lineCount = value.split("\n").length;
  const markup = `${highlight(value, language)}\n`;

  const reportCaret = (el: HTMLTextAreaElement) => {
    const upto = el.value.slice(0, el.selectionStart);
    const line = upto.split("\n").length;
    setCaretLine(line);
    onCaret?.(line, el.selectionStart - upto.lastIndexOf("\n"));
  };

  const sync = (e: UIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (preRef.current) {
      preRef.current.scrollTop = el.scrollTop;
      preRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  return (
    <div className={`harbor-code relative flex overflow-hidden bg-[#282c34] ${className ?? ""}`}>
      <div
        ref={gutterRef}
        aria-hidden
        className={`${BOX} shrink-0 select-none overflow-hidden pr-3.5 text-right`}
        style={{ minWidth: "4ch" }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={i + 1 === caretLine ? "text-[#d7dae0]" : "text-[#4b5263]"}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 z-0 bg-[#2c313a]"
          style={{
            top: PAD_TOP_PX + (caretLine - 1) * LINE_PX - scrollTop,
            height: LINE_PX,
            boxShadow: "inset 3px 0 0 #e3b341",
          }}
        />
        <pre
          ref={preRef}
          aria-hidden
          className={`${BOX} pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre text-[#abb2bf]`}
        >
          <code dangerouslySetInnerHTML={{ __html: markup }} />
        </pre>
        <textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            reportCaret(e.currentTarget);
          }}
          onScroll={sync}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => reportCaret(e.currentTarget)}
          onClick={(e) => reportCaret(e.currentTarget)}
          onFocus={(e) => reportCaret(e.currentTarget)}
          autoFocus={autoFocus}
          spellCheck={false}
          wrap="off"
          className={`${BOX} absolute inset-0 z-20 block h-full w-full resize-none overflow-auto whitespace-pre bg-transparent text-transparent caret-[#e3b341] outline-none`}
        />
      </div>
    </div>
  );
}
