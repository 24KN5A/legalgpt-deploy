import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import jsLang from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import tsLang from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsxLang from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsxLang from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import pythonLang from "react-syntax-highlighter/dist/esm/languages/prism/python";
import jsonLang from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bashLang from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import cssLang from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markupLang from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import sqlLang from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { useTheme } from "../../lib/theme-context";

SyntaxHighlighter.registerLanguage("javascript", jsLang);
SyntaxHighlighter.registerLanguage("typescript", tsLang);
SyntaxHighlighter.registerLanguage("jsx", jsxLang);
SyntaxHighlighter.registerLanguage("tsx", tsxLang);
SyntaxHighlighter.registerLanguage("python", pythonLang);
SyntaxHighlighter.registerLanguage("json", jsonLang);
SyntaxHighlighter.registerLanguage("bash", bashLang);
SyntaxHighlighter.registerLanguage("css", cssLang);
SyntaxHighlighter.registerLanguage("html", markupLang);
SyntaxHighlighter.registerLanguage("markup", markupLang);
SyntaxHighlighter.registerLanguage("sql", sqlLang);

const KNOWN_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "python",
  "json",
  "bash",
  "css",
  "html",
  "markup",
  "sql",
]);

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const safeLanguage = KNOWN_LANGUAGES.has(language) ? language : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide"
        style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-faint)" }}
      >
        <span>{language || "text"}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:text-[var(--color-text)]">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {safeLanguage ? (
        <SyntaxHighlighter
          language={safeLanguage}
          style={theme === "dark" ? oneDark : undefined}
          customStyle={{ margin: 0, fontSize: 12.5, background: "var(--color-surface)" }}
        >
          {value}
        </SyntaxHighlighter>
      ) : (
        <pre
          className="overflow-x-auto p-3 font-mono text-[12.5px]"
          style={{ background: "var(--color-surface)" }}
        >
          {value}
        </pre>
      )}
    </div>
  );
}

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-sm max-w-none text-sm leading-relaxed [&_a]:text-[var(--color-accent)] [&_code]:font-mono [&_ol]:pl-5 [&_ul]:pl-5 [&_p]:my-2 [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props;
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");
            if (isInline) {
              return (
                <code
                  className="rounded px-1.5 py-0.5 font-mono text-[0.85em]"
                  style={{ background: "var(--color-border)" }}
                >
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock
                language={match ? match[1] : ""}
                value={String(children).replace(/\n$/, "")}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
