import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

export const renderRichTextToHtml = (input: string | null | undefined) => {
  const source = String(input ?? "").trim();
  if (!source) {
    return "";
  }

  const parsed = marked.parse(source, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(parsed, SANITIZE_OPTIONS);

  if (typeof window === "undefined") {
    return sanitized;
  }

  const wrapper = window.document.createElement("div");
  wrapper.innerHTML = sanitized;

  const links = wrapper.querySelectorAll("a[href]");
  links.forEach((link) => {
    const href = String(link.getAttribute("href") ?? "").trim();
    if (!href || href.toLowerCase().startsWith("javascript:")) {
      link.removeAttribute("href");
      return;
    }

    if (href.startsWith("http://") || href.startsWith("https://")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });

  return wrapper.innerHTML;
};
