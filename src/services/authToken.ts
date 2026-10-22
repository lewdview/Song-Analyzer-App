// The signed-in th3scr1b3 account's access token, kept in step with the
// shared login (sharedSupabase.ts) so request helpers can stay synchronous.
// Writes to the analyzer's edge function need it: they're admin-only.
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;
