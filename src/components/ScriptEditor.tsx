import { useEffect, useMemo, useRef } from "react";

type ScriptEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "var",
  "function",
  "return",
  "default",
  "if",
  "else",
  "true",
  "false",
  "null",
  "undefined",
  "async",
  "await",
  "new",
]);

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const highlightLine = (line: string) => {
  const parts = line.split(/(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$][\w$]*\b)/g);

  return parts
    .map((part) => {
      if (!part) {
        return "";
      }

      const safe = escapeHtml(part);

      if (/^\/\/.*$/.test(part)) {
        return `<span class="script-editor__comment">${safe}</span>`;
      }
      if (/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)$/.test(part)) {
        return `<span class="script-editor__string">${safe}</span>`;
      }
      if (/^\d+(?:\.\d+)?$/.test(part)) {
        return `<span class="script-editor__number">${safe}</span>`;
      }
      if (KEYWORDS.has(part)) {
        return `<span class="script-editor__keyword">${safe}</span>`;
      }
      if (/^(sleep|check|http|options)$/.test(part)) {
        return `<span class="script-editor__symbol">${safe}</span>`;
      }

      return safe;
    })
    .join("");
};

export const ScriptEditor = ({ value, onChange }: ScriptEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => {
    const split = value.split("\n");
    return split.length > 0 ? split : [""];
  }, [value]);

  const highlightedLines = useMemo(
    () => lines.map((line) => (line.length > 0 ? highlightLine(line) : "&nbsp;")),
    [lines],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    const code = codeRef.current;
    const gutter = gutterRef.current;

    if (!textarea || !code || !gutter) {
      return;
    }

    const syncScroll = () => {
      code.scrollTop = textarea.scrollTop;
      code.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    };

    syncScroll();
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, [value]);

  return (
    <div className="script-editor">
      <div ref={gutterRef} className="script-editor__gutter" aria-hidden="true">
        {lines.map((_, index) => (
          <div key={index} className="script-editor__line-number">
            {index + 1}
          </div>
        ))}
      </div>

      <div className="script-editor__viewport">
        <pre ref={codeRef} className="script-editor__code" aria-hidden="true">
          {highlightedLines.map((line, index) => (
            <div key={index} className="script-editor__line" dangerouslySetInnerHTML={{ __html: line }} />
          ))}
        </pre>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="script-editor__textarea"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
};
