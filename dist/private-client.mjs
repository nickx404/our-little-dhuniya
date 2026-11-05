let token = '';
export function setToken(value) { token = value; }
export function isPrivate() { return Boolean(token); }

export async function api(path, options = {}, format = 'json') {
 const headers = new Headers(options.headers);
 headers.set('Authorization', `Bearer ${token}`);
 if (options.json !== undefined) {
  headers.set('Content-Type', 'application/json');
  options = {...options, body:JSON.stringify(options.json)};
 }
 const response = await fetch(path, {...options, headers, cache:'no-store'});
 if (!response.ok) {
  const result = await response.json().catch(()=>({}));
  if (response.status === 401) {
   token = '';
   window.dispatchEvent(new Event('scrapbook-locked'));
  }
  throw new Error(result.error || `Request failed (${response.status}).`);
 }
 return format === 'text' ? response.text() : response.json();
}

export async function mediaUrl(id) {
 return (await api(`/api/items/${encodeURIComponent(id)}/link`, {method:'POST'})).url;
}
