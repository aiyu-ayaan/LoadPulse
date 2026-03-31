const escapeForSingleQuote = (value) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const buildDefaultScript = ({ targetUrl, vus, duration }) => {
  const safeUrl = escapeForSingleQuote(targetUrl);

  return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: ${vus},
  duration: '${duration}',
};

export default function () {
  const response = http.get('${safeUrl}');
  check(response, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  sleep(1);
}
`;
};

export const resolveScript = (payload) => {
  const providedScript = payload?.script?.trim();
  if (providedScript) {
    return providedScript;
  }

  return buildDefaultScript(payload);
};
