"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 12 * 1024 * 1024
});

const PORT = process.env.PORT || 10000;

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "M4_CHAT_CHANGE_THIS_SECRET_2026";

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "12mb"
}));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

/* =========================================================
   DATABASE
========================================================= */

let database = {
    users: {},
    messages: {},
    friendRequests: [],
    friendships: []
};

let saveTimer = null;

function ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });
    }
}

function saveDatabase() {
    ensureDataDirectory();

    try {
        const temp = DATA_FILE + ".tmp";

        fs.writeFileSync(
            temp,
            JSON.stringify(database, null, 2),
            "utf8"
        );

        fs.renameSync(temp, DATA_FILE);
    } catch (error) {
        console.error("[DATA] Save error:", error);
    }
}

function scheduleSave() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        saveDatabase();
    }, 500);
}

function loadDatabase() {
    ensureDataDirectory();

    if (!fs.existsSync(DATA_FILE)) {
        saveDatabase();
        return;
    }

    try {
        const raw = fs.readFileSync(
            DATA_FILE,
            "utf8"
        );

        if (!raw.trim()) {
            return;
        }

        const parsed = JSON.parse(raw);

        database = {
            users:
                parsed.users &&
                typeof parsed.users === "object"
                    ? parsed.users
                    : {},

            messages:
                parsed.messages &&
                typeof parsed.messages === "object"
                    ? parsed.messages
                    : {},

            friendRequests:
                Array.isArray(parsed.friendRequests)
                    ? parsed.friendRequests
                    : [],

            friendships:
                Array.isArray(parsed.friendships)
                    ? parsed.friendships
                    : []
        };

        console.log(
            `[DATA] Loaded ${Object.keys(database.users).length} users`
        );

    } catch (error) {
        console.error("[DATA] Load error:", error);

        database = {
            users: {},
            messages: {},
            friendRequests: [],
            friendships: []
        };
    }
}

loadDatabase();

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

function getUser(username) {
    const key = normalizeUsername(username);

    return database.users[key] || null;
}

/* =========================================================
   USER
========================================================= */

function createUser(username, password) {
    const clean = cleanUsername(username);
    const key = normalizeUsername(clean);

    const passwordHash = bcrypt.hashSync(
        password,
        12
    );

    const user = {
        username: clean,
        passwordHash,
        avatar:
            clean.charAt(0).toUpperCase(),
        createdAt: now(),
        online: false
    };

    database.users[key] = user;

    scheduleSave();

    return user;
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

function getAuthenticatedUser(req) {
    const token =
        getTokenFromRequest(req);

    const payload =
        verifyToken(token);

    if (!payload || !payload.username) {
        return null;
    }

    return getUser(payload.username);
}

function requireAuth(req, res, next) {
    const user =
        getAuthenticatedUser(req);

    if (!user) {
        return res.status(401).json({
            success: false,
            ok: false,
            message: "Bạn chưa đăng nhập."
        });
    }

    req.user = user;

    next();
}

/* =========================================================
   AUTH API - REGISTER
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
                typeof req.body?.password === "string"
                    ? req.body.password
                    : "";

            const confirmPassword =
                typeof req.body?.confirmPassword === "string"
                    ? req.body.confirmPassword
                    : "";

            if (!validUsername(username)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Username chỉ được dùng chữ, số và dấu _, từ 3 đến 20 ký tự."
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
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
                    message:
                        "Mật khẩu xác nhận không khớp."
                });
            }

            if (getUser(username)) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Username đã tồn tại."
                });
            }

            const user =
                createUser(
                    username,
                    password
                );

            const token =
                createToken(user);

            res.cookie(
                "m4_token",
                token,
                {
                    httpOnly: true,
                    sameSite: "lax",
                    secure:
                        process.env.NODE_ENV ===
                        "production",
                    maxAge:
                        30 * 24 * 60 * 60 * 1000,
                    path: "/"
                }
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

            return res.status(500).json({
                success: false,
                message:
                    "Không thể tạo tài khoản."
            });
        }
    }
);

/* =========================================================
   AUTH API - LOGIN
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
                typeof req.body?.password === "string"
                    ? req.body.password
                    : "";

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Vui lòng nhập username và mật khẩu."
                });
            }

            const user =
                getUser(username);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Username hoặc mật khẩu không đúng."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.passwordHash || ""
                );

            if (!valid) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Username hoặc mật khẩu không đúng."
                });
            }

            const token =
                createToken(user);

            res.cookie(
                "m4_token",
                token,
                {
                    httpOnly: true,
                    sameSite: "lax",
                    secure:
                        process.env.NODE_ENV ===
                        "production",
                    maxAge:
                        30 * 24 * 60 * 60 * 1000,
                    path: "/"
                }
            );

            user.lastLogin =
                now();

            scheduleSave();

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
                message:
                    "Không thể đăng nhập."
            });
        }
    }
);

/* =========================================================
   AUTH API - ME
========================================================= */

app.get(
    "/api/me",
    requireAuth,
    (req, res) => {

        const user =
            req.user;

        res.json({
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
   AUTH API - LOGOUT
========================================================= */

app.post(
    "/api/logout",
    (req, res) => {

        res.clearCookie(
            "m4_token",
            {
                httpOnly: true,
                sameSite: "lax",
                secure:
                    process.env.NODE_ENV ===
                    "production",
                path: "/"
            }
        );

        res.json({
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
    (req, res) => {

        res.json({
            ok: true,
            success: true,
            name: "M4 Chat",
            status: "online",
            users:
                Object.keys(
                    database.users
                ).length,
            conversations:
                Object.keys(
                    database.messages
                ).length,
            time: now()
        });
    }
);

/* =========================================================
   ONLINE USERS
========================================================= */

const onlineUsers = new Map();

function addOnlineUser(
    username,
    socketId
) {
    const key =
        normalizeUsername(username);

    if (!key) {
        return;
    }

    if (!onlineUsers.has(key)) {
        onlineUsers.set(
            key,
            new Set()
        );
    }

    onlineUsers
        .get(key)
        .add(socketId);

    const user =
        getUser(username);

    if (user) {
        user.online = true;
        scheduleSave();
    }

    io.emit(
        "user_status",
        {
            username:
                user
                    ? user.username
                    : username,
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

    if (sockets.size === 0) {

        onlineUsers.delete(key);

        const user =
            getUser(username);

        if (user) {
            user.online = false;
            scheduleSave();
        }

        io.emit(
            "user_status",
            {
                username:
                    user
                        ? user.username
                        : username,
                online: false
            }
        );
    }
}

function isUserOnline(username) {
    const sockets =
        onlineUsers.get(
            normalizeUsername(username)
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
            normalizeUsername(username)
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
    (req, res) => {

        const username =
            cleanUsername(
                req.params.username
            );

        const user =
            getUser(username);

        if (!user) {
            return res.status(404).json({
                ok: false,
                message:
                    "Không tìm thấy người dùng."
            });
        }

        res.json({
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
    }
);

/* =========================================================
   CONVERSATIONS
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

function getConversation(
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

    if (
        !Array.isArray(
            database.messages[key]
        )
    ) {
        database.messages[key] = [];
    }

    return database.messages[key];
}

function storeMessage(
    userA,
    userB,
    message
) {
    const conversation =
        getConversation(
            userA,
            userB
        );

    if (
        conversation.some(
            item =>
                item &&
                item.id === message.id
        )
    ) {
        return message;
    }

    conversation.push(message);

    if (conversation.length > 5000) {
        conversation.splice(
            0,
            conversation.length - 5000
        );
    }

    scheduleSave();

    return message;
}

app.get(
    "/api/messages",
    requireAuth,
    (req, res) => {

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

        res.json({
            ok: true,
            messages:
                getConversation(
                    user,
                    withUser
                )
        });
    }
);

/* =========================================================
   FRIEND SYSTEM
========================================================= */

function hasFriend(
    userA,
    userB
) {
    const a =
        normalizeUsername(userA);

    const b =
        normalizeUsername(userB);

    return database.friendships.some(
        f =>
            (
                f.a === a &&
                f.b === b
            ) ||
            (
                f.a === b &&
                f.b === a
            )
    );
}

function addFriendship(
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

    if (hasFriend(a, b)) {
        return true;
    }

    database.friendships.push({
        id: createID(),
        a,
        b,
        createdAt: now()
    });

    scheduleSave();

    return true;
}

function hasPendingRequest(
    from,
    to
) {
    const a =
        normalizeUsername(from);

    const b =
        normalizeUsername(to);

    return database.friendRequests.some(
        r =>
            r.status === "pending" &&
            r.from === a &&
            r.to === b
    );
}

app.get(
    "/api/friends/:username",
    requireAuth,
    (req, res) => {

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

        const friends =
            database.friendships
                .filter(
                    f =>
                        f.a === username ||
                        f.b === username
                )
                .map(
                    f =>
                        f.a === username
                            ? f.b
                            : f.a
                )
                .map(
                    key =>
                        database.users[key]
                )
                .filter(Boolean)
                .map(user => ({
                    username:
                        user.username,
                    avatar:
                        user.avatar,
                    online:
                        isUserOnline(
                            user.username
                        )
                }));

        res.json({
            ok: true,
            friends
        });
    }
);

app.get(
    "/api/friend-requests/:username",
    requireAuth,
    (req, res) => {

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
            database.friendRequests.filter(
                r =>
                    r.to === username &&
                    r.status === "pending"
            );

        const outgoing =
            database.friendRequests.filter(
                r =>
                    r.from === username &&
                    r.status === "pending"
            );

        res.json({
            ok: true,
            incoming,
            outgoing
        });
    }
);

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
           AUTH SOCKET
        ================================================= */

        socket.on(
            "user_online",
            data => {

                /*
                 * QUAN TRỌNG:
                 * Không tin username client gửi.
                 *
                 * Socket sẽ kiểm tra JWT cookie.
                 */

                const token =
                    socket.handshake.auth?.token ||
                    socket.handshake.headers
                        ?.cookie
                        ?.match(
                            /(?:^|;\s*)m4_token=([^;]+)/
                        )?.[1];

                const payload =
                    verifyToken(token);

                if (
                    !payload ||
                    !payload.username
                ) {
                    socket.emit(
                        "auth_error",
                        {
                            error:
                                "Bạn chưa đăng nhập."
                        }
                    );

                    return;
                }

                const user =
                    getUser(
                        payload.username
                    );

                if (!user) {
                    socket.emit(
                        "auth_error",
                        {
                            error:
                                "Tài khoản không tồn tại."
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
            }
        );

        /* ================================================
           HISTORY
        ================================================= */

        socket.on(
            "get_messages",
            data => {

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

                socket.emit(
                    "message_history",
                    {
                        username:
                            withUser,
                        messages:
                            getConversation(
                                socketUsername,
                                withUser
                            )
                    }
                );
            }
        );

        /* ================================================
           PRIVATE MESSAGE
        ================================================= */

        socket.on(
            "private_message",
            data => {

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
                    normalizeUsername(from) ===
                    normalizeUsername(to)
                ) {
                    return;
                }

                const receiver =
                    getUser(to);

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
                    typeof data.text === "string"
                        ? data.text.slice(0, 5000)
                        : "";

                let image =
                    typeof data.image === "string"
                        ? data.image
                        : "";

                if (
                    image.length >
                    10 * 1024 * 1024
                ) {
                    return;
                }

                if (!text && !image) {
                    return;
                }

                const sender =
                    getUser(from);

                const message = {
                    id:
                        typeof data.id === "string"
                            ? data.id.slice(0, 100)
                            : createID(),

                    username:
                        sender.username,

                    avatar:
                        sender.avatar,

                    text,
                    image,

                    time:
                        Number.isFinite(
                            Number(data.time)
                        )
                            ? Number(data.time)
                            : now(),

                    reply:
                        data.reply &&
                        typeof data.reply === "object"
                            ? {
                                username:
                                    cleanUsername(
                                        data.reply.username
                                    ),
                                text:
                                    String(
                                        data.reply.text ||
                                        ""
                                    ).slice(0, 1000)
                            }
                            : null
                };

                storeMessage(
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
            data => {

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
                    normalizeUsername(from) ===
                    normalizeUsername(to)
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
                    getUser(to);

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
                    hasFriend(
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
                    hasPendingRequest(
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
                    database.friendRequests.find(
                        r =>
                            r.status === "pending" &&
                            r.from ===
                                normalizeUsername(to) &&
                            r.to ===
                                normalizeUsername(from)
                    );

                if (reverse) {

                    reverse.status =
                        "accepted";

                    addFriendship(
                        from,
                        to
                    );

                    scheduleSave();

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
                    id: createID(),

                    from:
                        normalizeUsername(from),

                    to:
                        normalizeUsername(to),

                    fromUsername:
                        from,

                    toUsername:
                        receiver.username,

                    status:
                        "pending",

                    createdAt:
                        now()
                };

                database.friendRequests.push(
                    request
                );

                scheduleSave();

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
            }
        );

        /* ================================================
           ACCEPT
        ================================================= */

        socket.on(
            "accept_friend_request",
            data => {

                if (!socketUsername) {
                    return;
                }

                const request =
                    database.friendRequests.find(
                        r =>
                            r.id === data?.id &&
                            r.status === "pending"
                    );

                if (!request) {
                    return;
                }

                if (
                    request.to !==
                    normalizeUsername(
                        socketUsername
                    )
                ) {
                    return;
                }

                request.status =
                    "accepted";

                addFriendship(
                    request.fromUsername,
                    socketUsername
                );

                scheduleSave();

                socket.emit(
                    "friend_request_accepted",
                    {
                        username:
                            request.fromUsername
                    }
                );

                sendToUser(
                    request.fromUsername,
                    "friend_request_accepted",
                    {
                        username:
                            socketUsername
                    }
                );
            }
        );

        /* ================================================
           REJECT
        ================================================= */

        socket.on(
            "reject_friend_request",
            data => {

                if (!socketUsername) {
                    return;
                }

                const request =
                    database.friendRequests.find(
                        r =>
                            r.id === data?.id &&
                            r.status === "pending"
                    );

                if (!request) {
                    return;
                }

                if (
                    request.to !==
                    normalizeUsername(
                        socketUsername
                    )
                ) {
                    return;
                }

                request.status =
                    "rejected";

                scheduleSave();

                socket.emit(
                    "friend_request_rejected",
                    {
                        username:
                            request.fromUsername
                    }
                );
            }
        );

        /* ================================================
           UPDATE AVATAR
        ================================================= */

        socket.on(
            "update_avatar",
            data => {

                if (!socketUsername) {
                    return;
                }

                const avatar =
                    typeof data?.avatar === "string"
                        ? data.avatar
                        : "";

                if (!avatar) {
                    return;
                }

                if (
                    avatar.length >
                    7 * 1024 * 1024
                ) {
                    return;
                }

                const user =
                    getUser(
                        socketUsername
                    );

                if (!user) {
                    return;
                }

                user.avatar =
                    avatar;

                scheduleSave();

                io.emit(
                    "user_avatar",
                    {
                        username:
                            user.username,
                        avatar
                    }
                );

                socket.emit(
                    "avatar_updated",
                    {
                        username:
                            user.username,
                        avatar
                    }
                );
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

        if (fs.existsSync(index)) {
            return res.sendFile(index);
        }

        res.status(404).send(
            "Không tìm thấy public/index.html"
        );
    }
);

/* =========================================================
   API 404
========================================================= */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({
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

        res.status(500).json({
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
            `DATA: ${DATA_FILE}`
        );
        console.log(
            `PUBLIC: ${PUBLIC_DIR}`
        );
        console.log(
            "AUTH: JWT COOKIE ENABLED"
        );
        console.log(
            "REGISTER: ENABLED"
        );
        console.log(
            "LOGIN: ENABLED"
        );
        console.log(
            "API ME: ENABLED"
        );
        console.log(
            "SOCKET.IO: ENABLED"
        );
        console.log(
            "FRIENDS: ENABLED"
        );
        console.log(
            "======================================"
        );
        console.log("");
    }
);

/* =========================================================
   SHUTDOWN
========================================================= */

function shutdown(signal) {

    console.log(
        `[SERVER] ${signal} received.`
    );

    try {
        clearTimeout(saveTimer);
        saveDatabase();
    } catch (error) {
        console.error(
            "[SERVER] Save error:",
            error
        );
    }

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
}

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);