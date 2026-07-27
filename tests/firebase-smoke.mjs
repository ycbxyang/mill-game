import { firebaseConfig } from "../firebase-config.js";

const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
for (const key of required) {
  if (!firebaseConfig[key]) throw new Error(`Missing Firebase config: ${key}`);
}

async function anonymousUser() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    }
  );
  if (!response.ok) {
    throw new Error(`Anonymous auth failed (${response.status}): ${await response.text()}`);
  }
  const user = await response.json();
  return { uid: user.localId, token: user.idToken };
}

async function databaseRequest(path, token, method, body) {
  const base = firebaseConfig.databaseURL.replace(/\/$/, "");
  const response = await fetch(
    `${base}/${path}.json?auth=${encodeURIComponent(token)}`,
    {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

const code = String(Math.floor(100000 + Math.random() * 900000));
const [host, guest] = await Promise.all([anonymousUser(), anonymousUser()]);

try {
  await databaseRequest(`rooms/${code}`, host.token, "PUT", {
    hostUid: host.uid,
    updatedAt: Date.now()
  });

  await databaseRequest(`rooms/${code}/guestUid`, guest.token, "PUT", guest.uid);

  const state = {
    board: [0, null, null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null, null, null, null, null],
    hand: [8, 9],
    turn: 1,
    selected: null,
    removing: false,
    winner: null,
    winnerReason: "",
    last: 0
  };
  await databaseRequest(`rooms/${code}/state`, host.token, "PUT", state);

  const room = await databaseRequest(`rooms/${code}`, guest.token, "GET");
  if (room?.guestUid !== guest.uid || room?.state?.board?.[0] !== 0) {
    throw new Error("Synced room state did not match");
  }

  console.log("Firebase remote play smoke test passed.");
} finally {
  await databaseRequest(`rooms/${code}`, host.token, "DELETE").catch(() => {});
}
