const http = require("http");
const fs = require("fs");

const config = require("./config.json");
const tasks = require("./tasks");
const types = require("./types");

let authorized = null;

global.authorized = authorized;
global.api = api;

await authorize();

for (const task of tasks) {
    const foundType = types.find(i => i.type === task.type);
    if (!foundType) throw new Error(`Couldn't find type ${task.type} for ${task.name}`);
    log(null, `Setting up ${task.name}`);

    task.run = () => {
        return foundType.runScript(task).then(() => {
            log(task, "Run successfully");
        }).catch(err => {
            log(task, `Failed to run, ${err}`);
        });
    }
 
    if (task.runOnSetup) task.run();

    if (!task.interval) continue;

    if (task.startDate) {
        log(task, `Interval will not be started until ${task.startDate.toLocaleString()}`);
        setTimeout(runInterval, task.startDate - Date.now());
    } else {
        runInterval();
    }
    async function runInterval(firstRun = true) {
        if (firstRun && task.runOnStart) await task.run();
        const timeout = task.interval * 1 * 60 * 1000;
        log(task, `Next run is at ${new Date(Date.now() + timeout).toLocaleString()}`);
        setTimeout(async () => {
            await task.run();
            runInterval(false);
        }, timeout);
    };
}

function api(path, options) {
    return new Promise(async (resolve, reject) => {
        if (!isAuthorized()) await authorize();

        const res = await fetch(`https://api.spotify.com/v1${path}`, {
            ...(options || {}),
            headers: {
                "Authorization": `${authorized.tokenType || "Bearer"} ${authorized.accessToken}`,
                ...(options?.headers || {})
            },
        });

        let data;
        try { data = await res.json() } catch (err) {
            return reject(`Failed to parse response to JSON, ${err}`);
        }

        resolve({
            res,
            status: res.status,
            statusMessage: res.statusText,
            data
        });
    });
}

function log(task, ...message) {
    console.log(`[${new Date().toLocaleString()}]${task ? ` [${task.name}]` : ""}`, ...message);
}

/**
 * Authorize with Spotify using the Authorization Code with PKCE Flow or by refreshing the token, resolves if already authorized
 */
function authorize(force) {
    return new Promise(async (resolve, reject) => {
        if (!force) {
            if (isAuthorized()) return resolve(authorized);
    
            if (fs.existsSync("./.refresh_token")) {
                log(null, "Authorizing with Spotify");
                try {
                    const refreshTokenFile = fs.readFileSync("./.refresh_token").toString().trim();
                    const tokenResponse = await refreshAccessToken(refreshTokenFile);
                    fs.writeFileSync("./.refresh_token", tokenResponse.refreshToken);
                    authorized = tokenResponse;
                    return resolve(authorized);
                } catch (err) { 
                    log(null, err.message);
                }
            }
        }

        const { codeVerifier, codeChallenge } = await genCodeChallenge();
        const redirectUri = encodeURIComponent(config.redirectUri);
        const authorizeUrl = `https://accounts.spotify.com/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${config.scopes.join("%20")}&code_challenge_method=S256&code_challenge=${codeChallenge}`;

        const authorizeServer = http.createServer(async (req, res) => {
            const path = req.url.split("?")[0];
            const query = Object.fromEntries(req.url.split("?")[1]?.split("&").map(i => i.split("=")) || []);
            if (path === "/") {
                return res.writeHead(302, { location: authorizeUrl }).end();
            } else if (path === "/callback") {
                if (query.error) {
                    log(null, `Failed to authorize, ${query.error}`);
                    return res.writeHead(500, { "content-type": "text/html" }).end(`Failed to authorize, ${query.error}`);
                }
                if (!query.code) {
                    return res.writeHead(400, { "content-type": "text/html" }).end("No code found in query!");
                }

                try {
                    const tokenResponse = await requestAccessToken(query.code);
                    fs.writeFileSync("./.refresh_token", tokenResponse.refreshToken);
                    res.writeHead(200, { "content-type": "text/html" }).end(`<script>window.close()</script>Authorized with Spotify, you can now close this tab`);
                    authorizeServer.close();
                    authorized = tokenResponse;
                    return resolve(authorized);
                } catch (err) {
                    return reject(`Failed to authorize, ${err}`);
                }
            } else {
                return res.writeHead(302, { location: "/" }).end();
            }
        }).listen(config.authorizeServerPort, () => {
            log(null, `To authorize with Spotify, go to http://localhost:${config.authorizeServerPort}/`);
            log(null, "You should only need to do this once");
            // log(null, `Alternatively, you can also go to ${authorizeUrl}`);
        });

        function genCodeChallenge() {
            return new Promise(async resolve => {
                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                const values = crypto.getRandomValues(Buffer.alloc(64));
                const codeVerifier = values.reduce((acc, x) => acc + chars[x % chars.length], "");

                const hashed = await crypto.subtle.digest("SHA-256", Buffer.from(codeVerifier));

                const codeChallenge = Buffer.from(hashed).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

                return resolve({ codeVerifier, hashed, codeChallenge });
            });
        }

        function requestAccessToken(code) {
            return new Promise(async (resolve, reject) => {
                try {
                    const res = await fetch("https://accounts.spotify.com/api/token", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}&client_id=${config.clientId}&code_verifier=${codeVerifier}`
                    });

                    let data;
                    try { data = await res.json() } catch (err) {
                        throw new Error(`Failed to parse response to JSON, ${err}`);
                    }
                    if (data.error || data.error_description) {
                        throw new Error(`Failed to request token, ${data.error || "no error"} - ${data.error_description || "no error description"}`);
                    }
                    if (!data.access_token) {
                        throw new Error("Did not get access token");
                    }

                    return resolve({
                        accessToken: data.access_token,
                        tokenType: data.token_type,
                        refreshToken: data.refresh_token,
                        expiresIn: data.expires_in * 1000,
                        expiryDate: new Date(Date.now() + data.expires_in * 1000)
                    });
                } catch (err) {
                    return reject(`Failed to request token, ${err}`);
                }
            });
        }

        function refreshAccessToken(refreshToken) {
            return new Promise(async (resolve, reject) => {
                try {
                    const res = await fetch("https://accounts.spotify.com/api/token", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${config.clientId}`
                    });

                    let data;
                    try { data = await res.json() } catch (err) {
                        throw new Error(`Failed to parse response to JSON, ${err}`);
                    }
                    if (data.error || data.error_description) {
                        throw new Error(`Failed to refresh token, ${data.error || "no error"} - ${data.error_description || "no error description"}`);
                    }
                    if (!data.access_token) {
                        throw new Error("Did not get access token");
                    }

                    return resolve({
                        accessToken: data.access_token,
                        tokenType: data.token_type,
                        refreshToken: data.refresh_token,
                        expiresIn: data.expires_in * 1000,
                        expiryDate: new Date(Date.now() + data.expires_in * 1000)
                    });
                } catch (err) {
                    return reject(err);
                }
            });
        }
    });
}

function isAuthorized() {
    return (authorized?.expiryDate - Date.now()) > 5000;
}