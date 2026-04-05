import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface RichTextViewProps {
  content: string | null | undefined;
  className?: string;
}

export const RichTextView = ({ content, className = "" }: RichTextViewProps) => {
  const source = String(content ?? "").trim();

  if (!source) {
    return null;
  }

  return (
    <div className={`ai-rich-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {source}
      </ReactMarkdown>
    </div>
  );
};
