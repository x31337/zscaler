export const URL = window.URL;

export const urlToHttpOptions = (url: URL) => {
  const headers: { [key: string]: string } = {};
  if (url.username || url.password) {
    headers['authorization'] = 'Basic ' + btoa(url.username + ':' + url.password);
  }

  return {
    protocol: url.protocol,
    hostname: url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: url.pathname + url.search,
    href: url.href,
    port: url.port ? parseInt(url.port, 10) : undefined,
    auth: url.username || url.password
      ? `${url.username}:${url.password}`
      : undefined,
    headers
  };
};

export default {
  URL,
  urlToHttpOptions
};

