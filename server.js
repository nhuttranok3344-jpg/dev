"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT) || 10000;

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "M4_CHAT_CHANGE_THIS_SECRET_2026";

const PUBLIC_DIR = path.join(__dirname, "public");

const DATABASE_URL =
    process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
    console.error("");
    console.error("======================================");
    console.error("DATABASE_URL NOT FOUND");
    console.error("======================================");
    console.error(
        "Hãy thêm DATABASE_URL vào Environment của Render."
    );
    console.error("");
}

/* =========================================================
   POSTGRESQL
========================================================= */

const pool = new Pool({
    connectionString: DATABASE_URL,

    ssl: DATABASE_URL
        ? {
            rejectUnauthorized: false
        }
        : false,

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error(
        "[POSTGRES] Unexpected pool error:",
        error
    );
});

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
        methods: ["GET", "POST"]
    },

    maxHttpBufferSize: 12 * 1024 * 1024
});

/* =========================================================
   EXPRESS
========================================================= */

app.use(
    express.json({
        limit: "12mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "12mb"
    })
);

app.use(cookieParser());

app.use(
    express.static(PUBLIC_DIR)
);

/* =========================================================
   HELPERS
========================================================= */

function now() {
    return Date.now();
}

function createID() {
    return (
        Date.now().toString(36) +
        "-" +
        crypto.randomBytes(8).toString("hex")
    );
}

function cleanUsername(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 30);
}

function normalizeUsername(value) {
    return cleanUsername(value).toLowerCase();
}

function validUsername(value) {
    return /^[A-Za-z0-9_]{3,20}$/.test(value);
}

/* =========================================================
   DATABASE INIT
========================================================= */

async function initDatabase() {

    console.log("[POSTGRES] Initializing database...");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            username_key VARCHAR(30) PRIMARY KEY,
            username VARCHAR(30) NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            created_at BIGINT NOT NULL,
            last_login BIGINT DEFAULT NULL
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(150) PRIMARY KEY,
            conversation_key VARCHAR(100) NOT NULL,
            sender_key VARCHAR(30) NOT NULL,
            sender_username VARCHAR(30) NOT NULL,
            sender_avatar TEXT DEFAULT '',
            receiver_key VARCHAR(30) NOT NULL,
            text TEXT DEFAULT '',
            image TEXT DEFAULT '',
            message_time BIGINT NOT NULL,
            reply_username VARCHAR(30) DEFAULT '',
            reply_text TEXT DEFAULT ''
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_key, message_time)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS friend_requests (
            id VARCHAR(150) PRIMARY KEY,
            from_key VARCHAR(30) NOT NULL,
            to_key VARCHAR(30) NOT NULL,
            from_username VARCHAR(30) NOT NULL,
            to_username VARCHAR(30) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at BIGINT NOT NULL
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_friend_requests_to
        ON friend_requests(to_key, status)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_friend_requests_from
        ON friend_requests(from_key, status)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS friendships (
            id VARCHAR(150) PRIMARY KEY,
            user_a VARCHAR(30) NOT NULL,
            user_b VARCHAR(30) NOT NULL,
            created_at BIGINT NOT NULL
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_friendships_a
        ON friendships(user_a)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_friendships_b
        ON friendships(user_b)
    `);

    console.log("[POSTGRES] Database ready.");
}

/* =========================================================
   USER DATABASE
========================================================= */

async function getUser(username) {

    const key =
        normalizeUsername(username);

    if (!key) {
        return null;
    }

    const result = await pool.query(
        `
        SELECT
            username_key,
            username,
            password_hash,
            avatar,
            created_at,
            last_login
        FROM users
        WHERE username_key = $1
        LIMIT 1
        `,
        [key]
    );

    if (!result.rows.length) {
        return null;
    }

    const row = result.rows[0];

    return {
        username: row.username,
        usernameKey: row.username_key,
        passwordHash: row.password_hash,
        avatar: row.avatar || "",
        createdAt: Number(row.created_at),
        lastLogin:
            row.last_login
                ? Number(row.last_login)
                : null
    };
}

async function createUser(
    username,
    password
) {

    const clean =
        cleanUsername(username);

    const key =
        normalizeUsername(clean);

    const passwordHash =
        await bcrypt.hash(
            password,
            12
        );

    const createdAt =
        now();

    const avatar =
        clean.charAt(0).toUpperCase();

    const result = await pool.query(
        `
        INSERT INTO users (
            username_key,
            username,
            password_hash,
            avatar,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            username_key,
            username,
            password_hash,
            avatar,
            created_at,
            last_login
        `,
        [
            key,
            clean,
            passwordHash,
            avatar,
            createdAt
        ]
    );

    const row = result.rows[0];

    return {
        username: row.username,
        usernameKey: row.username_key,
        passwordHash: row.password_hash,
        avatar: row.avatar,
        createdAt:
            Number(row.created_at),
        lastLogin: null
    };
}

/* =========================================================
   JWT
========================================================= */

function createToken(user) {

    return jwt.sign(
        {
            username: user.username
        },
        JWT_SECRET,
        {
            expiresIn: "30d"
        }
    );
}

function getTokenFromRequest(req) {

    return req.cookies &&
        req.cookies.m4_token
        ? req.cookies.m4_token
        : "";
}

function verifyToken(token) {

    if (!token) {
        return null;
    }

    try {
        return jwt.verify(
            token,
            JWT_SECRET
        );
    } catch {
        return null;
    }
}

async function getAuthenticatedUser(req) {

    const token =
        getTokenFromRequest(req);

    const payload =
        verifyToken(token);

    if (
        !payload ||
        !payload.username
    ) {
        return null;
    }

    return getUser(
        payload.username
    );
}

async function requireAuth(
    req,
    res,
    next
) {

    try {

        const user =
            await getAuthenticatedUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                ok: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }

        req.user = user;

        next();

    } catch (error) {

        console.error(
            "[AUTH]",
            error
        );

        return res.status(500).json({
            success: false,
            ok: false,
            message:
                "Không thể xác thực tài khoản."
        });
    }
}

/* =========================================================
   COOKIE
========================================================= */

function setAuthCookie(
    res,
    token
) {

    res.cookie(
        "m4_token",
        token,
        {
            httpOnly: true,

            sameSite:
                process.env.NODE_ENV ===
                "production"
                    ? "none"
                    : "lax",

            secure:
                process.env.NODE_ENV ===
                "production",

            maxAge:
                30 *
                24 *
                60 *
                60 *
                1000,

            path: "/"
        }
    );
}

function clearAuthCookie(res) {

    res.clearCookie(
        "m4_token",
        {
            httpOnly: true,

            sameSite:
                process.env.NODE_ENV ===
                "production"
                    ? "none"
                    : "lax",

            secure:
                process.env.NODE_ENV ===
                "production",

            path: "/"
        }
    );
}

/* =========================================================
   REGISTER
========================================================= */

app.post(
    "/api/register",
    async (req, res) => {

        try {

            const username =
                cleanUsername(
                    req.body &&
                    req.body.username
                );

            const password =
                typeof req.body?.password ===
                "string"
                    ? req.body.password
                    : "";

            const confirmPassword =
                typeof req.body?.confirmPassword ===
                "string"
                    ? req.body.confirmPassword
                    : "";

            if (!validUsername(username)) {

                return res.status(400).json({
                    success: false,
                    ok: false,
                    message:
                        "Username chỉ được dùng chữ, số và dấu _, từ 3 đến 20 ký tự."
                });
            }

            if (password.length < 6) {

                return res.status(400).json({
                    success: false,
                    ok: false,
                    message:
                        "Mật khẩu phải có ít nhất 6 ký tự."
                });
            }

            if (
                confirmPassword &&
                password !== confirmPassword
            ) {

                return res.status(400).json({
                    success: false,
                    ok: false,
                    message:
                        "Mật khẩu xác nhận không khớp."
                });
            }

            const existing =
                await getUser(username);

            if (existing) {

                return res.status(409).json({
                    success: false,
                    ok: false,
                    message:
                        "Username đã tồn tại."
                });
            }

            const user =
                await createUser(
                    username,
                    password
                );

            const token =
                createToken(user);

            setAuthCookie(
                res,
                token
            );

            return res.json({
                success: true,
                ok: true,

                message:
                    "Tạo tài khoản thành công.",

                user: {
                    username:
                        user.username,

                    avatar:
                        user.avatar,

                    online: false
                }
            });

        } catch (error) {

            console.error(
                "[REGISTER]",
                error
            );

            if (
                error.code ===
                "23505"
            ) {
                return res.status(409).json({
                    success: false,
                    ok: false,
                    message:
                        "Username đã tồn tại."
                });
            }

            return res.status(500).json({
                success: false,
                ok: false,
                message:
                    "Không thể tạo tài khoản."
            });
        }
    }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const username =
                cleanUsername(
                    req.body &&
                    req.body.username
                );

            const password =
                typeof req.body?.password ===
                "string"
                    ? req.body.password
                    : "";

            if (
                !username ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    ok: false,
                    message:
                        "Vui lòng nhập username và mật khẩu."
                });
            }

            const user =
                await getUser(username);

            if (!user) {

                return res.status(401).json({
                    success: false,
                    ok: false,
                    message:
                        "Username hoặc mật khẩu không đúng."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.passwordHash
                );

            if (!valid) {

                return res.status(401).json({
                    success: false,
                    ok: false,
                    message:
                        "Username hoặc mật khẩu không đúng."
                });
            }

            const loginTime =
                now();

            await pool.query(
                `
                UPDATE users
                SET last_login = $1
                WHERE username_key = $2
                `,
                [
                    loginTime,
                    user.usernameKey
                ]
            );

            user.lastLogin =
                loginTime;

            const token =
                createToken(user);

            setAuthCookie(
                res,
                token
            );

            return res.json({
                success: true,
                ok: true,

                message:
                    "Đăng nhập thành công.",

                user: {
                    username:
                        user.username,

                    avatar:
                        user.avatar,

                    online:
                        isUserOnline(
                            user.username
                        )
                }
            });

        } catch (error) {

            console.error(
                "[LOGIN]",
                error
            );

            return res.status(500).json({
                success: false,
                ok: false,
                message:
                    "Không thể đăng nhập."
            });
        }
    }
);

/* =========================================================
   ME
========================================================= */

app.get(
    "/api/me",
    requireAuth,
    async (req, res) => {

        const user =
            req.user;

        return res.json({
            success: true,
            ok: true,
            authenticated: true,

            user: {
                username:
                    user.username,

                avatar:
                    user.avatar,

                online:
                    isUserOnline(
                        user.username
                    ),

                createdAt:
                    user.createdAt
            }
        });
    }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
    "/api/logout",
    (req, res) => {

        clearAuthCookie(res);

        return res.json({
            success: true,
            ok: true
        });
    }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/api/health",
    async (req, res) => {

        try {

            const db =
                await pool.query(
                    "SELECT NOW() AS time"
                );

            const users =
                await pool.query(
                    "SELECT COUNT(*)::int AS count FROM users"
                );

            const messages =
                await pool.query(
                    "SELECT COUNT(*)::int AS count FROM messages"
                );

            return res.json({
                success: true,
                ok: true,

                name:
                    "M4 Chat",

                status:
                    "online",

                database:
                    "connected",

                users:
                    users.rows[0].count,

                messages:
                    messages.rows[0].count,

                time:
                    now(),

                postgresTime:
                    db.rows[0].time
            });

        } catch (error) {

            console.error(
                "[HEALTH]",
                error
            );

            return res.status(500).json({
                success: false,
                ok: false,
                status:
                    "database_error",
                database:
                    "disconnected"
            });
        }
    }
);

/* =========================================================
   ONLINE SYSTEM
========================================================= */

const onlineUsers =
    new Map();

function addOnlineUser(
    username,
    socketId
) {

    const key =
        normalizeUsername(username);

    if (!key) {
        return;
    }

    if (
        !onlineUsers.has(key)
    ) {
        onlineUsers.set(
            key,
            new Set()
        );
    }

    onlineUsers
        .get(key)
        .add(socketId);

    io.emit(
        "user_status",
        {
            username,
            online: true
        }
    );
}

function removeOnlineUser(
    username,
    socketId
) {

    const key =
        normalizeUsername(username);

    const sockets =
        onlineUsers.get(key);

    if (!sockets) {
        return;
    }

    sockets.delete(socketId);

    if (
        sockets.size === 0
    ) {

        onlineUsers.delete(key);

        io.emit(
            "user_status",
            {
                username,
                online: false
            }
        );
    }
}

function isUserOnline(
    username
) {

    const sockets =
        onlineUsers.get(
            normalizeUsername(
                username
            )
        );

    return !!(
        sockets &&
        sockets.size
    );
}

function sendToUser(
    username,
    event,
    data
) {

    const sockets =
        onlineUsers.get(
            normalizeUsername(
                username
            )
        );

    if (!sockets) {
        return false;
    }

    for (const id of sockets) {

        io.to(id).emit(
            event,
            data
        );
    }

    return true;
}

/* =========================================================
   USER API
========================================================= */

app.get(
    "/api/user/:username",
    async (req, res) => {

        try {

            const username =
                cleanUsername(
                    req.params.username
                );

            const user =
                await getUser(
                    username
                );

            if (!user) {

                return res.status(404).json({
                    ok: false,
                    message:
                        "Không tìm thấy người dùng."
                });
            }

            return res.json({
                ok: true,

                user: {
                    username:
                        user.username,

                    avatar:
                        user.avatar,

                    online:
                        isUserOnline(
                            user.username
                        )
                }
            });

        } catch (error) {

            console.error(
                "[USER]",
                error
            );

            return res.status(500).json({
                ok: false,
                message:
                    "Không thể lấy thông tin người dùng."
            });
        }
    }
);

/* =========================================================
   CONVERSATION
========================================================= */

function conversationKey(
    userA,
    userB
) {

    const a =
        normalizeUsername(userA);

    const b =
        normalizeUsername(userB);

    if (!a || !b) {
        return "";
    }

    return [a, b]
        .sort()
        .join("::");
}

async function getConversation(
    userA,
    userB
) {

    const key =
        conversationKey(
            userA,
            userB
        );

    if (!key) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT
                id,
                sender_username AS username,
                sender_avatar AS avatar,
                receiver_key,
                text,
                image,
                message_time AS time,
                reply_username,
                reply_text
            FROM messages
            WHERE conversation_key = $1
            ORDER BY message_time ASC
            LIMIT 5000
            `,
            [key]
        );

    return result.rows.map(
        row => ({
            id:
                row.id,

            username:
                row.username,

            avatar:
                row.avatar || "",

            text:
                row.text || "",

            image:
                row.image || "",

            time:
                Number(row.time),

            reply:
                row.reply_username ||
                row.reply_text
                    ? {
                        username:
                            row.reply_username ||
                            "",

                        text:
                            row.reply_text ||
                            ""
                    }
                    : null
        })
    );
}

async function storeMessage(
    from,
    to,
    message
) {

    const conversation =
        conversationKey(
            from,
            to
        );

    const sender =
        await getUser(from);

    await pool.query(
        `
        INSERT INTO messages (
            id,
            conversation_key,
            sender_key,
            sender_username,
            sender_avatar,
            receiver_key,
            text,
            image,
            message_time,
            reply_username,
            reply_text
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
            message.id,

            conversation,

            normalizeUsername(
                from
            ),

            sender
                ? sender.username
                : from,

            sender
                ? sender.avatar
                : "",

            normalizeUsername(
                to
            ),

            message.text || "",

            message.image || "",

            message.time,

            message.reply?.username ||
                "",

            message.reply?.text ||
                ""
        ]
    );

    return message;
}

/* =========================================================
   GET MESSAGES
========================================================= */

app.get(
    "/api/messages",
    requireAuth,
    async (req, res) => {

        try {

            const user =
                req.user.username;

            const withUser =
                cleanUsername(
                    req.query.with
                );

            if (!withUser) {

                return res.status(400).json({
                    ok: false,
                    message:
                        "Thiếu người chat."
                });
            }

            return res.json({
                ok: true,

                messages:
                    await getConversation(
                        user,
                        withUser
                    )
            });

        } catch (error) {

            console.error(
                "[MESSAGES]",
                error
            );

            return res.status(500).json({
                ok: false,
                message:
                    "Không thể tải tin nhắn."
            });
        }
    }
);

/* =========================================================
   FRIENDS
========================================================= */

async function hasFriend(
    userA,
    userB
) {

    const a =
        normalizeUsername(userA);

    const b =
        normalizeUsername(userB);

    const result =
        await pool.query(
            `
            SELECT 1
            FROM friendships
            WHERE
                (user_a = $1 AND user_b = $2)
                OR
                (user_a = $2 AND user_b = $1)
            LIMIT 1
            `,
            [a, b]
        );

    return result.rows.length > 0;
}

async function addFriendship(
    userA,
    userB
) {

    const a =
        normalizeUsername(userA);

    const b =
        normalizeUsername(userB);

    if (
        !a ||
        !b ||
        a === b
    ) {
        return false;
    }

    if (
        await hasFriend(a, b)
    ) {
        return true;
    }

    await pool.query(
        `
        INSERT INTO friendships (
            id,
            user_a,
            user_b,
            created_at
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
            createID(),
            a,
            b,
            now()
        ]
    );

    return true;
}

async function hasPendingRequest(
    from,
    to
) {

    const a =
        normalizeUsername(from);

    const b =
        normalizeUsername(to);

    const result =
        await pool.query(
            `
            SELECT 1
            FROM friend_requests
            WHERE
                from_key = $1
                AND to_key = $2
                AND status = 'pending'
            LIMIT 1
            `,
            [a, b]
        );

    return result.rows.length > 0;
}

/* =========================================================
   FRIEND LIST
========================================================= */

app.get(
    "/api/friends/:username",
    requireAuth,
    async (req, res) => {

        try {

            const username =
                normalizeUsername(
                    req.params.username
                );

            if (
                username !==
                normalizeUsername(
                    req.user.username
                )
            ) {

                return res.status(403).json({
                    ok: false,
                    message:
                        "Không được xem danh sách bạn của tài khoản khác."
                });
            }

            const result =
                await pool.query(
                    `
                    SELECT
                        CASE
                            WHEN f.user_a = $1
                            THEN f.user_b
                            ELSE f.user_a
                        END AS friend_key
                    FROM friendships f
                    WHERE
                        f.user_a = $1
                        OR f.user_b = $1
                    ORDER BY f.created_at DESC
                    `,
                    [username]
                );

            const friends = [];

            for (
                const row of result.rows
            ) {

                const user =
                    await getUser(
                        row.friend_key
                    );

                if (!user) {
                    continue;
                }

                friends.push({
                    username:
                        user.username,

                    avatar:
                        user.avatar,

                    online:
                        isUserOnline(
                            user.username
                        )
                });
            }

            return res.json({
                ok: true,
                friends
            });

        } catch (error) {

            console.error(
                "[FRIENDS]",
                error
            );

            return res.status(500).json({
                ok: false,
                message:
                    "Không thể tải danh sách bạn."
            });
        }
    }
);

/* =========================================================
   FRIEND REQUEST LIST
========================================================= */

app.get(
    "/api/friend-requests/:username",
    requireAuth,
    async (req, res) => {

        try {

            const username =
                normalizeUsername(
                    req.params.username
                );

            if (
                username !==
                normalizeUsername(
                    req.user.username
                )
            ) {

                return res.status(403).json({
                    ok: false,
                    message:
                        "Không hợp lệ."
                });
            }

            const incoming =
                await pool.query(
                    `
                    SELECT
                        id,
                        from_key AS "from",
                        to_key AS "to",
                        from_username AS "fromUsername",
                        to_username AS "toUsername",
                        status,
                        created_at AS "createdAt"
                    FROM friend_requests
                    WHERE
                        to_key = $1
                        AND status = 'pending'
                    ORDER BY created_at DESC
                    `,
                    [username]
                );

            const outgoing =
                await pool.query(
                    `
                    SELECT
                        id,
                        from_key AS "from",
                        to_key AS "to",
                        from_username AS "fromUsername",
                        to_username AS "toUsername",
                        status,
                        created_at AS "createdAt"
                    FROM friend_requests
                    WHERE
                        from_key = $1
                        AND status = 'pending'
                    ORDER BY created_at DESC
                    `,
                    [username]
                );

            return res.json({
                ok: true,
                incoming:
                    incoming.rows,
                outgoing:
                    outgoing.rows
            });

        } catch (error) {

            console.error(
                "[FRIEND REQUESTS]",
                error
            );

            return res.status(500).json({
                ok: false,
                message:
                    "Không thể tải lời mời kết bạn."
            });
        }
    }
);

/* =========================================================
   SOCKET AUTH
========================================================= */

function getCookieToken(
    socket
) {

    const authToken =
        socket.handshake.auth?.token;

    if (authToken) {
        return authToken;
    }

    const cookie =
        socket.handshake.headers?.cookie ||
        "";

    const match =
        cookie.match(
            /(?:^|;\s*)m4_token=([^;]+)/
        );

    return match
        ? decodeURIComponent(match[1])
        : "";
}

async function authenticateSocket(
    socket
) {

    const token =
        getCookieToken(socket);

    const payload =
        verifyToken(token);

    if (
        !payload ||
        !payload.username
    ) {
        return null;
    }

    return getUser(
        payload.username
    );
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "[SOCKET] Connected:",
            socket.id
        );

        let socketUsername = "";

        /* ================================================
           USER ONLINE
        ================================================= */

        socket.on(
            "user_online",
            async () => {

                try {

                    const user =
                        await authenticateSocket(
                            socket
                        );

                    if (!user) {

                        socket.emit(
                            "auth_error",
                            {
                                error:
                                    "Bạn chưa đăng nhập."
                            }
                        );

                        return;
                    }

                    socketUsername =
                        user.username;

                    socket.join(
                        "user:" +
                        normalizeUsername(
                            user.username
                        )
                    );

                    addOnlineUser(
                        user.username,
                        socket.id
                    );

                    socket.emit(
                        "current_user",
                        {
                            username:
                                user.username,

                            avatar:
                                user.avatar,

                            online: true
                        }
                    );

                    console.log(
                        `[ONLINE] ${user.username}`
                    );

                } catch (error) {

                    console.error(
                        "[SOCKET AUTH]",
                        error
                    );

                    socket.emit(
                        "auth_error",
                        {
                            error:
                                "Lỗi xác thực."
                        }
                    );
                }
            }
        );

        /* ================================================
           HISTORY
        ================================================= */

        socket.on(
            "get_messages",
            async data => {

                try {

                    if (!socketUsername) {

                        socket.emit(
                            "message_error",
                            {
                                error:
                                    "Bạn chưa đăng nhập."
                            }
                        );

                        return;
                    }

                    const withUser =
                        cleanUsername(
                            data &&
                            (
                                data.with ||
                                data.username
                            )
                        );

                    if (!withUser) {
                        return;
                    }

                    const messages =
                        await getConversation(
                            socketUsername,
                            withUser
                        );

                    socket.emit(
                        "message_history",
                        {
                            username:
                                withUser,

                            messages
                        }
                    );

                } catch (error) {

                    console.error(
                        "[SOCKET HISTORY]",
                        error
                    );
                }
            }
        );

        /* ================================================
           PRIVATE MESSAGE
        ================================================= */

        socket.on(
            "private_message",
            async data => {

                try {

                    if (!socketUsername) {

                        socket.emit(
                            "message_error",
                            {
                                error:
                                    "Bạn chưa đăng nhập."
                            }
                        );

                        return;
                    }

                    const from =
                        socketUsername;

                    const to =
                        cleanUsername(
                            data?.to
                        );

                    if (!to) {
                        return;
                    }

                    if (
                        normalizeUsername(
                            from
                        ) ===
                        normalizeUsername(
                            to
                        )
                    ) {
                        return;
                    }

                    const receiver =
                        await getUser(to);

                    if (!receiver) {

                        socket.emit(
                            "message_error",
                            {
                                error:
                                    "Không tìm thấy người nhận."
                            }
                        );

                        return;
                    }

                    let text =
                        typeof data?.text ===
                        "string"
                            ? data.text.slice(
                                0,
                                5000
                            )
                            : "";

                    let image =
                        typeof data?.image ===
                        "string"
                            ? data.image
                            : "";

                    if (
                        image.length >
                        10 *
                        1024 *
                        1024
                    ) {

                        socket.emit(
                            "message_error",
                            {
                                error:
                                    "Ảnh quá lớn."
                            }
                        );

                        return;
                    }

                    if (
                        !text &&
                        !image
                    ) {
                        return;
                    }

                    const sender =
                        await getUser(from);

                    const message = {

                        id:
                            typeof data?.id ===
                            "string"
                                ? data.id.slice(
                                    0,
                                    100
                                )
                                : createID(),

                        username:
                            sender.username,

                        avatar:
                            sender.avatar,

                        text,

                        image,

                        time:
                            Number.isFinite(
                                Number(
                                    data?.time
                                )
                            )
                                ? Number(
                                    data.time
                                )
                                : now(),

                        reply:
                            data?.reply &&
                            typeof data.reply ===
                            "object"
                                ? {
                                    username:
                                        cleanUsername(
                                            data.reply.username
                                        ),

                                    text:
                                        String(
                                            data.reply.text ||
                                            ""
                                        ).slice(
                                            0,
                                            1000
                                        )
                                }
                                : null
                    };

                    await storeMessage(
                        from,
                        receiver.username,
                        message
                    );

                    socket.emit(
                        "message_saved",
                        {
                            id:
                                message.id,

                            to:
                                receiver.username,

                            message
                        }
                    );

                    sendToUser(
                        receiver.username,
                        "private_message",
                        {
                            ...message,

                            from,

                            to:
                                receiver.username,

                            mine: false
                        }
                    );

                } catch (error) {

                    console.error(
                        "[PRIVATE MESSAGE]",
                        error
                    );

                    socket.emit(
                        "message_error",
                        {
                            error:
                                "Không thể gửi tin nhắn."
                        }
                    );
                }
            }
        );

        /* ================================================
           TYPING
        ================================================= */

        socket.on(
            "typing",
            data => {

                if (!socketUsername) {
                    return;
                }

                const to =
                    cleanUsername(
                        data?.to
                    );

                if (!to) {
                    return;
                }

                sendToUser(
                    to,
                    "typing",
                    {
                        username:
                            socketUsername,

                        to,

                        stopped:
                            data?.stopped === true
                    }
                );
            }
        );

        /* ================================================
           FRIEND REQUEST
        ================================================= */

        socket.on(
            "friend_request",
            async data => {

                try {

                    if (!socketUsername) {

                        socket.emit(
                            "friend_request_error",
                            {
                                error:
                                    "Bạn chưa đăng nhập."
                            }
                        );

                        return;
                    }

                    const from =
                        socketUsername;

                    const to =
                        cleanUsername(
                            data?.to ||
                            data?.username
                        );

                    if (!to) {
                        return;
                    }

                    if (
                        normalizeUsername(
                            from
                        ) ===
                        normalizeUsername(
                            to
                        )
                    ) {

                        socket.emit(
                            "friend_request_error",
                            {
                                error:
                                    "Không thể kết bạn với chính mình."
                            }
                        );

                        return;
                    }

                    const receiver =
                        await getUser(to);

                    if (!receiver) {

                        socket.emit(
                            "friend_request_error",
                            {
                                error:
                                    "Không tìm thấy tài khoản."
                            }
                        );

                        return;
                    }

                    if (
                        await hasFriend(
                            from,
                            to
                        )
                    ) {

                        socket.emit(
                            "friend_request_error",
                            {
                                error:
                                    "Hai người đã là bạn."
                            }
                        );

                        return;
                    }

                    if (
                        await hasPendingRequest(
                            from,
                            to
                        )
                    ) {

                        socket.emit(
                            "friend_request_error",
                            {
                                error:
                                    "Bạn đã gửi lời mời trước đó."
                            }
                        );

                        return;
                    }

                    const reverse =
                        await pool.query(
                            `
                            SELECT *
                            FROM friend_requests
                            WHERE
                                from_key = $1
                                AND to_key = $2
                                AND status = 'pending'
                            LIMIT 1
                            `,
                            [
                                normalizeUsername(
                                    to
                                ),

                                normalizeUsername(
                                    from
                                )
                            ]
                        );

                    if (
                        reverse.rows.length
                    ) {

                        const request =
                            reverse.rows[0];

                        await pool.query(
                            `
                            UPDATE friend_requests
                            SET status = 'accepted'
                            WHERE id = $1
                            `,
                            [request.id]
                        );

                        await addFriendship(
                            from,
                            to
                        );

                        socket.emit(
                            "friend_request_accepted",
                            {
                                username:
                                    receiver.username
                            }
                        );

                        sendToUser(
                            receiver.username,
                            "friend_request_accepted",
                            {
                                username:
                                    from
                            }
                        );

                        return;
                    }

                    const request = {

                        id:
                            createID(),

                        from:
                            normalizeUsername(
                                from
                            ),

                        to:
                            normalizeUsername(
                                to
                            ),

                        fromUsername:
                            from,

                        toUsername:
                            receiver.username,

                        status:
                            "pending",

                        createdAt:
                            now()
                    };

                    await pool.query(
                        `
                        INSERT INTO friend_requests (
                            id,
                            from_key,
                            to_key,
                            from_username,
                            to_username,
                            status,
                            created_at
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7
                        )
                        `,
                        [
                            request.id,

                            request.from,

                            request.to,

                            request.fromUsername,

                            request.toUsername,

                            request.status,

                            request.createdAt
                        ]
                    );

                    socket.emit(
                        "friend_request_sent",
                        {
                            id:
                                request.id,

                            username:
                                receiver.username,

                            message:
                                "Đã gửi lời mời kết bạn."
                        }
                    );

                    sendToUser(
                        receiver.username,
                        "friend_request",
                        {
                            id:
                                request.id,

                            username:
                                from,

                            from:
                                from,

                            to:
                                receiver.username,

                            createdAt:
                                request.createdAt
                        }
                    );

                } catch (error) {

                    console.error(
                        "[FRIEND REQUEST]",
                        error
                    );

                    socket.emit(
                        "friend_request_error",
                        {
                            error:
                                "Không thể gửi lời mời."
                        }
                    );
                }
            }
        );

        /* ================================================
           ACCEPT
        ================================================= */

        socket.on(
            "accept_friend_request",
            async data => {

                try {

                    if (!socketUsername) {
                        return;
                    }

                    const result =
                        await pool.query(
                            `
                            SELECT *
                            FROM friend_requests
                            WHERE
                                id = $1
                                AND status = 'pending'
                            LIMIT 1
                            `,
                            [data?.id]
                        );

                    if (!result.rows.length) {
                        return;
                    }

                    const request =
                        result.rows[0];

                    if (
                        request.to_key !==
                        normalizeUsername(
                            socketUsername
                        )
                    ) {
                        return;
                    }

                    await pool.query(
                        `
                        UPDATE friend_requests
                        SET status = 'accepted'
                        WHERE id = $1
                        `,
                        [request.id]
                    );

                    await addFriendship(
                        request.from_username,
                        socketUsername
                    );

                    socket.emit(
                        "friend_request_accepted",
                        {
                            username:
                                request.from_username
                        }
                    );

                    sendToUser(
                        request.from_username,
                        "friend_request_accepted",
                        {
                            username:
                                socketUsername
                        }
                    );

                } catch (error) {

                    console.error(
                        "[ACCEPT FRIEND]",
                        error
                    );
                }
            }
        );

        /* ================================================
           REJECT
        ================================================= */

        socket.on(
            "reject_friend_request",
            async data => {

                try {

                    if (!socketUsername) {
                        return;
                    }

                    const result =
                        await pool.query(
                            `
                            SELECT *
                            FROM friend_requests
                            WHERE
                                id = $1
                                AND status = 'pending'
                            LIMIT 1
                            `,
                            [data?.id]
                        );

                    if (!result.rows.length) {
                        return;
                    }

                    const request =
                        result.rows[0];

                    if (
                        request.to_key !==
                        normalizeUsername(
                            socketUsername
                        )
                    ) {
                        return;
                    }

                    await pool.query(
                        `
                        UPDATE friend_requests
                        SET status = 'rejected'
                        WHERE id = $1
                        `,
                        [request.id]
                    );

                    socket.emit(
                        "friend_request_rejected",
                        {
                            username:
                                request.from_username
                        }
                    );

                } catch (error) {

                    console.error(
                        "[REJECT FRIEND]",
                        error
                    );
                }
            }
        );

        /* ================================================
           UPDATE AVATAR
        ================================================= */

        socket.on(
            "update_avatar",
            async data => {

                try {

                    if (!socketUsername) {
                        return;
                    }

                    const avatar =
                        typeof data?.avatar ===
                        "string"
                            ? data.avatar
                            : "";

                    if (!avatar) {
                        return;
                    }

                    if (
                        avatar.length >
                        7 *
                        1024 *
                        1024
                    ) {
                        return;
                    }

                    await pool.query(
                        `
                        UPDATE users
                        SET avatar = $1
                        WHERE username_key = $2
                        `,
                        [
                            avatar,

                            normalizeUsername(
                                socketUsername
                            )
                        ]
                    );

                    io.emit(
                        "user_avatar",
                        {
                            username:
                                socketUsername,

                            avatar
                        }
                    );

                    socket.emit(
                        "avatar_updated",
                        {
                            username:
                                socketUsername,

                            avatar
                        }
                    );

                } catch (error) {

                    console.error(
                        "[AVATAR]",
                        error
                    );
                }
            }
        );

        /* ================================================
           LOGOUT
        ================================================= */

        socket.on(
            "logout",
            () => {

                if (!socketUsername) {
                    return;
                }

                const username =
                    socketUsername;

                removeOnlineUser(
                    username,
                    socket.id
                );

                socket.leave(
                    "user:" +
                    normalizeUsername(
                        username
                    )
                );

                socketUsername = "";
            }
        );

        /* ================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "[SOCKET] Disconnected:",
                    socket.id,
                    reason
                );

                if (socketUsername) {

                    removeOnlineUser(
                        socketUsername,
                        socket.id
                    );
                }
            }
        );
    }
);

/* =========================================================
   ROOT
========================================================= */

app.get(
    "/",
    (req, res) => {

        const index =
            path.join(
                PUBLIC_DIR,
                "index.html"
            );

        return res.sendFile(index);
    }
);

/* =========================================================
   API 404
========================================================= */

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({
            ok: false,
            success: false,
            message:
                "API endpoint không tồn tại."
        });
    }
);

/* =========================================================
   ERROR
========================================================= */

app.use(
    (err, req, res, next) => {

        console.error(
            "[EXPRESS ERROR]",
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        return res.status(500).json({
            ok: false,
            success: false,
            message:
                "Internal server error."
        });
    }
);

/* =========================================================
   START
========================================================= */

async function startServer() {

    try {

        await initDatabase();

        server.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log("");
                console.log(
                    "======================================"
                );

                console.log(
                    "       M4 CHAT SERVER ONLINE"
                );

                console.log(
                    "======================================"
                );

                console.log(
                    `PORT: ${PORT}`
                );

                console.log(
                    "DATABASE: PostgreSQL"
                );

                console.log(
                    "REGISTER: ENABLED"
                );

                console.log(
                    "LOGIN: ENABLED"
                );

                console.log(
                    "JWT COOKIE: ENABLED"
                );

                console.log(
                    "SOCKET.IO: ENABLED"
                );

                console.log(
                    "PRIVATE CHAT: ENABLED"
                );

                console.log(
                    "FRIENDS: ENABLED"
                );

                console.log(
                    "AVATAR: ENABLED"
                );

                console.log(
                    "======================================"
                );

                console.log("");
            }
        );

    } catch (error) {

        console.error("");
        console.error(
            "======================================"
        );
        console.error(
            "M4 CHAT SERVER FAILED TO START"
        );
        console.error(
            "======================================"
        );
        console.error(error);
        console.error("");

        process.exit(1);
    }
}

/* =========================================================
   SHUTDOWN
========================================================= */

async function shutdown(
    signal
) {

    console.log(
        `[SERVER] ${signal} received.`
    );

    try {

        await pool.end();

        server.close(
            () => {

                console.log(
                    "[SERVER] Closed."
                );

                process.exit(0);
            }
        );

        setTimeout(
            () => process.exit(0),
            5000
        );

    } catch (error) {

        console.error(
            "[SERVER] Shutdown error:",
            error
        );

        process.exit(1);
    }
}

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

/* =========================================================
   START
========================================================= */

startServer();
