const encoder = new TextEncoder();
const prefix = 'virtual-temple-game-v1:';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

async function key(secret: string, usages: ('sign'|'verify')[]) {
  if (secret.length < 32) throw new Error('Game reward signing is not configured.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}
export async function signGameToken(secret: string, payload: object): Promise<string> {
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(secret, ['sign']), encoder.encode(prefix + body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}
export async function verifyGameToken<T>(secret: string, token: string): Promise<T | null> {
  if (typeof token !== 'string' || token.length > 10_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const [body, signature] = token.split('.');
    const valid = await crypto.subtle.verify('HMAC', await key(secret, ['verify']), decode(signature), encoder.encode(prefix + body));
    return valid ? JSON.parse(new TextDecoder().decode(decode(body))) as T : null;
  } catch { return null; }
}
