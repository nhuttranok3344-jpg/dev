
"use strict";

/* =========================================================
   M4 CHAT - APP.JS
   FULL VERSION
   - Auth
   - Socket.IO
   - Friends
   - Friend requests
   - Private messages
   - Message history
   - Image messages
   - Reply
   - Typing
   - Avatar
   - Username
   - Settings
   - Dark mode
   - Sound
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const $ = id => document.getElementById(id);

    const usernameText = $("usernameText");
    const userAvatar = $("userAvatar");

    const friendsList = $("friendsList");
    const defaultFriends = $("defaultFriends");
    const friendRequests = $("friendRequests");
    const friendSearch = $("friendSearch");

    const messages = $("messages");
    const welcome = $("welcome");

    const channelName = $("channelName");
    const channelTopic = $("channelTopic");
    const chatUserAvatar = $("chatUserAvatar");

    const privateUsername = $("privateUsername");
    const privateStatus = $("privateStatus");
    const privateAvatar = $("privateAvatar");

    const messageInput = $("messageInput");
    const sendButton = $("sendButton");

    const imageButton = $("imageButton");
    const imageInput = $("imageInput");

    const typingBox = $("typing");

    const replyBar = $("replyBar");
    const replyUsername = $("replyUsername");
    const replyPreview = $("replyPreview");
    const cancelReply = $("cancelReply");

    const addFriendModal = $("addFriendModal");
    const openAddFriend = $("openAddFriend");
    const closeAddFriend = $("closeAddFriend");

    const friendUsername = $("friendUsername");
    const sendFriendRequest = $("sendFriendRequest");
    const friendMessage = $("friendMessage");

    const settingsModal = $("settingsModal");
    const settingsButton = $("settingsButton");
    const closeSettings = $("closeSettings");
    const logoutButton = $("logoutButton");

    const accountUsername = $("accountUsername");
    const accountAvatar = $("accountAvatar");

    const newUsername = $("newUsername");
    const changeUsernameButton = $("changeUsernameButton");
    const usernameMessage = $("usernameMessage");

    const settingsAvatar = $("settingsAvatar");
    const avatarUpload = $("avatarUpload");

    const soundButton = $("soundButton");
    const soundToggle = $("soundToggle");

    const darkToggle = $("darkToggle");

    /* =====================================================
       STATE
    ===================================================== */

    let socket = null;

    let currentUser = null;
    let currentChatUser = null;

    let friends = [];
    let friendRequestData = [];

    let replyingTo = null;
    let typingTimer = null;

    let soundEnabled = true;
    let initialized = false;

    /* =====================================================
       HELPERS
    ===================================================== */

    function normalize(value) {
        return String(value || "")
            .trim()
            .toLowerCase();
    }

    function escapeHTML(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    function getInitial(username) {
        const value = String(username || "?").trim();

        return (
            value.charAt(0).toUpperCase() ||
            "?"
        );
    }

    function setMessage(element, text) {
        if (element) {
            element.textContent = text || "";
        }
    }

    function isCurrentUser(username) {
        if (!currentUser) {
            return false;
        }

        return (
            normalize(currentUser.username) ===
            normalize(username)
        );
    }

    function createClientID() {
        return (
            Date.now().toString(36) +
            "-" +
            Math.random()
                .toString(36)
                .slice(2, 12)
        );
    }

    /* =====================================================
       AVATAR
    ===================================================== */

    function isImageAvatar(value) {

        if (!value) {
            return false;
        }

        const avatar =
            String(value).trim();

        return (
            avatar.startsWith("data:image/") ||
            avatar.startsWith("blob:") ||
            avatar.startsWith("https://") ||
            avatar.startsWith("http://") ||
            avatar.startsWith("/")
        );
    }

    function renderAvatar(value, username = "") {

        const avatar =
            String(
                value || getInitial(username)
            ).trim();

        if (isImageAvatar(avatar)) {

            return `
                <img
                    class="avatar-image"
                    src="${escapeHTML(avatar)}"
                    alt="${escapeHTML(
                        username || "Avatar"
                    )}"
                    loading="lazy"
                >
            `;
        }

        return `
            <span class="avatar-letter">
                ${escapeHTML(
                    avatar || getInitial(username)
                )}
            </span>
        `;
    }

    function setAvatarElement(
        element,
        avatar,
        username
    ) {

        if (!element) {
            return;
        }

        element.innerHTML =
            renderAvatar(
                avatar,
                username
            );
    }

    function avatarValue(user) {

        if (!user) {
            return "";
        }

        return (
            user.avatar ||
            getInitial(user.username)
        );
    }

    /* =====================================================
       LOADING
    ===================================================== */

    function showLoadingState() {

        if (usernameText) {
            usernameText.textContent =
                "Đang xác thực...";
        }

        if (accountUsername) {
            accountUsername.textContent =
                "Đang xác thực...";
        }

        if (messageInput) {
            messageInput.disabled = true;
        }

        if (sendButton) {
            sendButton.disabled = true;
        }
    }

    function showLoggedOut() {

        if (usernameText) {
            usernameText.textContent =
                "Chưa đăng nhập";
        }

        if (accountUsername) {
            accountUsername.textContent =
                "Chưa đăng nhập";
        }

        if (messageInput) {
            messageInput.disabled = true;
        }

        if (sendButton) {
            sendButton.disabled = true;
        }
    }

    /* =====================================================
       CURRENT USER UI
    ===================================================== */

    function updateCurrentUserUI() {

        if (!currentUser) {
            return;
        }

        const username =
            currentUser.username || "User";

        const avatar =
            avatarValue(currentUser);

        if (usernameText) {
            usernameText.textContent =
                username;
        }

        if (accountUsername) {
            accountUsername.textContent =
                username;
        }

        setAvatarElement(
            userAvatar,
            avatar,
            username
        );

        setAvatarElement(
            accountAvatar,
            avatar,
            username
        );

        setAvatarElement(
            settingsAvatar,
            avatar,
            username
        );
    }

    /* =====================================================
       REQUEST JSON
    ===================================================== */

    async function requestJSON(
        url,
        options = {}
    ) {

        const response =
            await fetch(url, {
                credentials: "include",
                ...options
            });

        let data = {};

        try {
            data =
                await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {

            throw new Error(
                data.error ||
                data.message ||
                `HTTP ${response.status}`
            );
        }

        return data;
    }

    /* =====================================================
       AUTH
    ===================================================== */

    async function loadCurrentUser() {

        try {

            const data =
                await requestJSON(
                    "/api/me",
                    {
                        method: "GET"
                    }
                );

            if (
                !data ||
                !data.success ||
                !data.user ||
                !data.user.username
            ) {

                throw new Error(
                    "Bạn chưa đăng nhập."
                );
            }

            currentUser = {

                username:
                    String(
                        data.user.username
                    ),

                avatar:
                    data.user.avatar ||
                    getInitial(
                        data.user.username
                    )
            };

            updateCurrentUserUI();

            return true;

        } catch (error) {

            console.error(
                "[AUTH]",
                error
            );

            showLoggedOut();

            setTimeout(() => {

                window.location.replace(
                    "/login.html"
                );

            }, 500);

            return false;
        }
    }

    /* =====================================================
       SOCKET
    ===================================================== */

    function connectSocket() {

        if (!currentUser) {
            return;
        }

        if (typeof io !== "function") {

            console.error(
                "[SOCKET] Socket.IO chưa được tải."
            );

            return;
        }

        if (socket) {

            try {
                socket.disconnect();
            } catch {}

            socket = null;
        }

        socket = io({
            transports: [
                "websocket",
                "polling"
            ],

            withCredentials: true
        });

        /* =================================================
           CONNECT
        ================================================= */

        socket.on("connect", () => {

            console.log(
                "[SOCKET] Connected:",
                socket.id
            );

            socket.emit(
                "user_online",
                {
                    username:
                        currentUser.username,

                    avatar:
                        currentUser.avatar
                }
            );

            loadFriends();
            loadFriendRequests();

            if (currentChatUser) {
                requestHistory();
            }
        });

        /* =================================================
           CONNECT ERROR
        ================================================= */

        socket.on(
            "connect_error",
            error => {

                console.error(
                    "[SOCKET] Connection error:",
                    error
                );
            }
        );

        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "[SOCKET] Disconnected:",
                    reason
                );
            }
        );

        /* =================================================
           CURRENT USER
        ================================================= */

        socket.on(
            "current_user",
            user => {

                if (!user) {
                    return;
                }

                currentUser = {
                    ...currentUser,
                    ...user
                };

                updateCurrentUserUI();
            }
        );

        /* =================================================
           PRIVATE MESSAGE
        ================================================= */

        socket.on(
            "private_message",
            message => {

                if (
                    !message ||
                    !currentUser ||
                    !currentChatUser
                ) {
                    return;
                }

                const sender =
                    message.username ||
                    message.from ||
                    "";

                const receiver =
                    message.to ||
                    "";

                const senderIsCurrentChat =
                    normalize(sender) ===
                    normalize(
                        currentChatUser.username
                    );

                const messageIsMine =
                    normalize(sender) ===
                    normalize(
                        currentUser.username
                    );

                const receiverIsCurrentChat =
                    normalize(receiver) ===
                    normalize(
                        currentChatUser.username
                    );

                const belongsToCurrentChat =
                    senderIsCurrentChat ||
                    (
                        messageIsMine &&
                        receiverIsCurrentChat
                    );

                if (!belongsToCurrentChat) {
                    return;
                }

                appendMessage(
                    message
                );

                scrollMessages();

                if (
                    !messageIsMine
                ) {
                    playMessageSound();
                }
            }
        );

        /* =================================================
           MESSAGE SAVED
        ================================================= */

        socket.on(
            "message_saved",
            data => {

                if (
                    !data ||
                    !data.message ||
                    !currentUser ||
                    !currentChatUser
                ) {
                    return;
                }

                const message =
                    data.message;

                const sender =
                    message.username ||
                    message.from ||
                    "";

                const receiver =
                    message.to ||
                    data.to ||
                    "";

                const mine =
                    normalize(sender) ===
                    normalize(
                        currentUser.username
                    );

                const incoming =
                    normalize(sender) ===
                    normalize(
                        currentChatUser.username
                    );

                const outgoingToCurrent =
                    mine &&
                    normalize(receiver) ===
                    normalize(
                        currentChatUser.username
                    );

                if (
                    !incoming &&
                    !outgoingToCurrent
                ) {
                    return;
                }

                const id =
                    String(
                        message.id || ""
                    );

                if (id && messages) {

                    const existing =
                        messages.querySelector(
                            `[data-message-id="${CSS.escape(
                                id
                            )}"]`
                        );

                    if (existing) {
                        return;
                    }
                }

                appendMessage(
                    message
                );

                scrollMessages();
            }
        );

        /* =================================================
           HISTORY
        ================================================= */

        socket.on(
            "message_history",
            data => {

                if (!data) {
                    return;
                }

                if (
                    !currentChatUser ||
                    normalize(
                        data.username
                    ) !==
                    normalize(
                        currentChatUser.username
                    )
                ) {
                    return;
                }

                renderHistory(
                    Array.isArray(
                        data.messages
                    )
                        ? data.messages
                        : []
                );
            }
        );

        /* =================================================
           MESSAGE ERROR
        ================================================= */

        socket.on(
            "message_error",
            data => {

                alert(
                    data?.error ||
                    "Không thể gửi tin nhắn."
                );
            }
        );

        /* =================================================
           TYPING
        ================================================= */

        socket.on(
            "typing",
            data => {

                if (
                    !data ||
                    !typingBox ||
                    !currentChatUser
                ) {
                    return;
                }

                if (
                    normalize(
                        data.username
                    ) !==
                    normalize(
                        currentChatUser.username
                    )
                ) {
                    return;
                }

                typingBox.textContent =
                    data.stopped
                        ? ""
                        : `${data.username} đang nhập...`;
            }
        );

        /* =================================================
           USER STATUS
        ================================================= */

        socket.on(
            "user_status",
            data => {

                if (!data) {
                    return;
                }

                updatePresence(
                    data.username,
                    data.online
                );

                if (
                    currentChatUser &&
                    normalize(
                        currentChatUser.username
                    ) ===
                    normalize(
                        data.username
                    )
                ) {

                    currentChatUser.online =
                        !!data.online;

                    updateChatHeader();
                    updateProfile();
                }

                renderFriends();
            }
        );

        /* =================================================
           FRIEND REQUEST
        ================================================= */

        socket.on(
            "friend_request",
            () => {

                loadFriendRequests();

                playMessageSound();
            }
        );

        socket.on(
            "friend_request_sent",
            data => {

                setMessage(
                    friendMessage,
                    data?.message ||
                    "Đã gửi lời mời."
                );

                if (friendUsername) {
                    friendUsername.value = "";
                }

                loadFriendRequests();
            }
        );

        socket.on(
            "friend_request_error",
            data => {

                setMessage(
                    friendMessage,
                    data?.error ||
                    "Không thể gửi lời mời."
                );
            }
        );

        socket.on(
            "friend_request_accepted",
            () => {

                loadFriends();
                loadFriendRequests();

                setMessage(
                    friendMessage,
                    "Đã trở thành bạn bè."
                );
            }
        );

        socket.on(
            "friend_request_rejected",
            () => {

                loadFriendRequests();
            }
        );

        /* =================================================
           USER AVATAR
        ================================================= */

        socket.on(
            "user_avatar",
            data => {

                if (!data) {
                    return;
                }

                updateUserAvatar(
                    data.username,
                    data.avatar
                );

                if (
                    currentChatUser &&
                    normalize(
                        currentChatUser.username
                    ) ===
                    normalize(
                        data.username
                    )
                ) {

                    currentChatUser.avatar =
                        data.avatar;

                    updateChatHeader();
                    updateProfile();
                }

                if (
                    currentUser &&
                    normalize(
                        currentUser.username
                    ) ===
                    normalize(
                        data.username
                    )
                ) {

                    currentUser.avatar =
                        data.avatar;

                    updateCurrentUserUI();
                }
            }
        );

        /* =================================================
           USERNAME CHANGED
        ================================================= */

        socket.on(
            "username_changed",
            data => {

                if (
                    !data ||
                    !data.username
                ) {
                    return;
                }

                const oldUsername =
                    data.oldUsername ||
                    currentUser.username;

                currentUser.username =
                    data.username;

                updateCurrentUserUI();

                if (
                    currentChatUser &&
                    normalize(
                        currentChatUser.username
                    ) ===
                    normalize(oldUsername)
                ) {

                    currentChatUser.username =
                        data.username;

                    updateChatHeader();
                    updateProfile();
                }

                loadFriends();
                loadFriendRequests();

                setMessage(
                    usernameMessage,
                    "Đổi username thành công."
                );
            }
        );

        socket.on(
            "username_change_error",
            data => {

                setMessage(
                    usernameMessage,
                    data?.error ||
                    "Không thể đổi username."
                );
            }
        );

        /* =================================================
           AVATAR UPDATED
        ================================================= */

        socket.on(
            "avatar_updated",
            data => {

                if (!data) {
                    return;
                }

                if (data.avatar) {

                    currentUser.avatar =
                        data.avatar;
                }

                updateCurrentUserUI();

                updateUserAvatar(
                    currentUser.username,
                    currentUser.avatar
                );
            }
        );

        socket.on(
            "avatar_error",
            data => {

                alert(
                    data?.error ||
                    "Không thể đổi avatar."
                );
            }
        );
    }

    /* =====================================================
       FRIENDS
    ===================================================== */

    async function loadFriends() {

        if (!currentUser) {
            return;
        }

        try {

            const data =
                await requestJSON(
                    `/api/friends/${encodeURIComponent(
                        currentUser.username
                    )}`
                );

            friends =
                Array.isArray(data.friends)
                    ? data.friends
                    : [];

            renderFriends();

        } catch (error) {

            console.error(
                "[FRIENDS]",
                error
            );
        }
    }

    function renderFriends() {

        if (!friendsList) {
            return;
        }

        friendsList.innerHTML = "";

        const search =
            normalize(
                friendSearch?.value
            );

        const filtered =
            friends.filter(user => {

                if (!search) {
                    return true;
                }

                return normalize(
                    user.username
                ).includes(search);
            });

        if (!filtered.length) {

            friendsList.innerHTML =
                `
                <div class="empty-friends">
                    ${
                        friends.length
                            ? "Không tìm thấy bạn."
                            : "Chưa có bạn bè."
                    }
                </div>
                `;

            return;
        }

        filtered.forEach(user => {

            friendsList.appendChild(
                createFriendElement(user)
            );
        });
    }

    function createFriendElement(user) {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "dm-user";

        button.dataset.user =
            user.username;

        button.innerHTML = `
            <span class="dm-avatar">

                ${renderAvatar(
                    user.avatar,
                    user.username
                )}

                <i class="presence ${
                    user.online
                        ? "online"
                        : ""
                }"></i>

            </span>

            <span class="dm-user-info">

                <strong>
                    ${escapeHTML(
                        user.username
                    )}
                </strong>

                <small>
                    ${
                        user.online
                            ? "Đang hoạt động"
                            : "Offline"
                    }
                </small>

            </span>
        `;

        button.addEventListener(
            "click",
            () => openChat(user)
        );

        return button;
    }

    /* =====================================================
       FRIEND REQUESTS
    ===================================================== */

    async function loadFriendRequests() {

        if (!currentUser) {
            return;
        }

        try {

            const data =
                await requestJSON(
                    `/api/friend-requests/${encodeURIComponent(
                        currentUser.username
                    )}`
                );

            friendRequestData =
                Array.isArray(data.incoming)
                    ? data.incoming
                    : [];

            renderFriendRequests();

        } catch (error) {

            console.error(
                "[REQUESTS]",
                error
            );
        }
    }

    function renderFriendRequests() {

        if (!friendRequests) {
            return;
        }

        friendRequests.innerHTML = "";

        friendRequestData.forEach(
            request => {

                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "friend-request";

                const from =
                    request.fromUsername ||
                    request.from ||
                    "User";

                item.innerHTML = `
                    <div class="friend-request-info">

                        <strong>
                            ${escapeHTML(from)}
                        </strong>

                        <small>
                            Muốn kết bạn
                        </small>

                    </div>

                    <div class="friend-request-actions">

                        <button
                            type="button"
                            class="accept-request"
                        >✓</button>

                        <button
                            type="button"
                            class="reject-request"
                        >×</button>

                    </div>
                `;

                item.querySelector(
                    ".accept-request"
                )?.addEventListener(
                    "click",
                    () => {

                        if (!socket?.connected) {
                            return;
                        }

                        socket.emit(
                            "accept_friend_request",
                            {
                                id: request.id
                            }
                        );

                        item.remove();

                        setTimeout(
                            loadFriends,
                            300
                        );
                    }
                );

                item.querySelector(
                    ".reject-request"
                )?.addEventListener(
                    "click",
                    () => {

                        if (!socket?.connected) {
                            return;
                        }

                        socket.emit(
                            "reject_friend_request",
                            {
                                id: request.id
                            }
                        );

                        item.remove();
                    }
                );

                friendRequests.appendChild(
                    item
                );
            }
        );
    }

    /* =====================================================
       OPEN CHAT
    ===================================================== */

    function openChat(user) {

        if (!user?.username) {
            return;
        }

        if (
            normalize(user.username) ===
            normalize(currentUser?.username)
        ) {
            return;
        }

        currentChatUser = {

            username:
                String(user.username),

            avatar:
                user.avatar ||
                getInitial(user.username),

            online:
                !!user.online
        };

        updateChatHeader();
        updateProfile();

        if (messageInput) {

            messageInput.disabled =
                false;

            messageInput.placeholder =
                `Nhắn tin cho ${user.username}...`;
        }

        if (sendButton) {
            sendButton.disabled = true;
        }

        clearMessages();

        if (welcome) {
            welcome.style.display =
                "none";
        }

        requestHistory();

        document
            .querySelectorAll(".dm-user")
            .forEach(element => {

                element.classList.toggle(
                    "active",
                    normalize(
                        element.dataset.user
                    ) ===
                    normalize(
                        user.username
                    )
                );
            });
    }

    /* =====================================================
       CHAT HEADER
    ===================================================== */

    function updateChatHeader() {

        if (!currentChatUser) {
            return;
        }

        const username =
            currentChatUser.username;

        const avatar =
            avatarValue(
                currentChatUser
            );

        if (channelName) {
            channelName.textContent =
                username;
        }

        if (channelTopic) {
            channelTopic.textContent =
                currentChatUser.online
                    ? "Đang hoạt động"
                    : "Offline";
        }

        setAvatarElement(
            chatUserAvatar,
            avatar,
            username
        );
    }

    /* =====================================================
       PROFILE
    ===================================================== */

    function updateProfile() {

        if (!currentChatUser) {
            return;
        }

        const username =
            currentChatUser.username;

        const avatar =
            avatarValue(
                currentChatUser
            );

        if (privateUsername) {
            privateUsername.textContent =
                username;
        }

        if (privateStatus) {
            privateStatus.textContent =
                currentChatUser.online
                    ? "Online"
                    : "Offline";
        }

        setAvatarElement(
            privateAvatar,
            avatar,
            username
        );
    }

    /* =====================================================
       HISTORY
    ===================================================== */

    async function requestHistory() {

        if (
            !currentUser ||
            !currentChatUser
        ) {
            return;
        }

        if (socket?.connected) {

            socket.emit(
                "get_messages",
                {
                    user:
                        currentUser.username,

                    with:
                        currentChatUser.username
                }
            );

            return;
        }

        try {

            const data =
                await requestJSON(
                    `/api/messages?user=${encodeURIComponent(
                        currentUser.username
                    )}&with=${encodeURIComponent(
                        currentChatUser.username
                    )}`
                );

            renderHistory(
                Array.isArray(
                    data.messages
                )
                    ? data.messages
                    : []
            );

        } catch (error) {

            console.error(
                "[HISTORY]",
                error
            );
        }
    }

    function clearMessages() {

        if (messages) {
            messages.innerHTML = "";
        }
    }

    function renderHistory(history) {

        clearMessages();

        if (!history.length) {

            if (welcome) {

                messages.appendChild(
                    welcome
                );

                welcome.style.display =
                    "";
            }

            return;
        }

        if (welcome) {
            welcome.style.display =
                "none";
        }

        history.forEach(
            message => {

                appendMessage(
                    message
                );
            }
        );

        scrollMessages();
    }

    /* =====================================================
       MESSAGE
    ===================================================== */

    function appendMessage(
        message,
        mineOverride = null
    ) {

        if (
            !messages ||
            !message
        ) {
            return;
        }

        const id =
            message.id ||
            createClientID();

        const safeId =
            String(id);

        /* -----------------------------------------------
           chống message trùng
        ------------------------------------------------ */

        const existing =
            messages.querySelector(
                `[data-message-id="${CSS.escape(
                    safeId
                )}"]`
            );

        if (existing) {
            return;
        }

        const username =
            message.username ||
            message.from ||
            "User";

        const mine =
            mineOverride !== null
                ? mineOverride
                : isCurrentUser(
                    username
                );

        let avatar =
            message.avatar || "";

        if (!avatar) {

            if (
                isCurrentUser(
                    username
                )
            ) {

                avatar =
                    currentUser?.avatar ||
                    getInitial(username);

            } else {

                avatar =
                    currentChatUser?.avatar ||
                    getInitial(username);
            }
        }

        const text =
            String(
                message.text || ""
            );

        const time =
            formatTime(
                message.time
            );

        const row =
            document.createElement(
                "div"
            );

        row.className =
            `message-row ${
                mine
                    ? "mine"
                    : "theirs"
            }`;

        /* -----------------------------------------------
           QUAN TRỌNG
        ------------------------------------------------ */

        row.dataset.messageId =
            safeId;

        row.dataset.username =
            username;

        /* =================================================
           IMAGE
        ================================================= */

        let imageHTML = "";

        if (message.image) {

            imageHTML = `
                <div class="message-image-wrap">

                    <img
                        class="message-image"
                        src="${escapeHTML(
                            message.image
                        )}"
                        alt="Ảnh"
                        loading="lazy"
                    >

                </div>
            `;
        }

        /* =================================================
           REPLY
        ================================================= */

        let replyHTML = "";

        if (
            message.reply &&
            typeof message.reply ===
                "object"
        ) {

            replyHTML = `
                <div class="message-reply">

                    <strong>
                        ${escapeHTML(
                            message.reply.username ||
                            "User"
                        )}
                    </strong>

                    <span>
                        ${escapeHTML(
                            message.reply.text ||
                            "Ảnh"
                        )}
                    </span>

                </div>
            `;
        }

        /* =================================================
           BUBBLE
        ================================================= */

        let bubbleHTML = "";

        if (text) {

            bubbleHTML = `
                <div class="message-bubble">

                    <span class="message-text">
                        ${escapeHTML(text)}
                    </span>

                </div>
            `;
        }

        /* =================================================
           AVATAR
        ================================================= */

        const avatarHTML = `
            <div
                class="message-avatar"
                data-avatar-user="${escapeHTML(
                    username
                )}"
            >
                ${renderAvatar(
                    avatar,
                    username
                )}
            </div>
        `;

        /* =================================================
           CONTENT
        ================================================= */

        const contentHTML = `
            <div class="message-content">

                ${replyHTML}

                ${bubbleHTML}

                ${imageHTML}

                <div class="message-time">
                    ${escapeHTML(time)}
                </div>

            </div>
        `;

        if (mine) {

            row.innerHTML =
                contentHTML +
                avatarHTML;

        } else {

            row.innerHTML =
                avatarHTML +
                contentHTML;
        }

        /* =================================================
           DOUBLE CLICK = REPLY
        ================================================= */

        row.addEventListener(
            "dblclick",
            () => {

                setReply(
                    message
                );
            }
        );

        messages.appendChild(
            row
        );
    }

    /* =====================================================
       TIME
    ===================================================== */

    function formatTime(timestamp) {

        if (
            timestamp === undefined ||
            timestamp === null
        ) {
            return "";
        }

        let value =
            Number(timestamp);

        if (
            Number.isFinite(value) &&
            value < 100000000000
        ) {
            value *= 1000;
        }

        if (
            !Number.isFinite(value)
        ) {
            return "";
        }

        try {

            return new Date(value)
                .toLocaleTimeString(
                    "vi-VN",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

        } catch {

            return "";
        }
    }

    function scrollMessages() {

        if (!messages) {
            return;
        }

        requestAnimationFrame(() => {

            messages.scrollTop =
                messages.scrollHeight;
        });
    }

    /* =====================================================
       SEND TEXT
    ===================================================== */

    function sendMessage() {

        if (!socket?.connected) {

            alert(
                "Chưa kết nối máy chủ."
            );

            return;
        }

        if (
            !currentUser ||
            !currentChatUser
        ) {
            return;
        }

        const text =
            messageInput?.value
                ?.trim() || "";

        if (!text) {
            return;
        }

        const message = {

            id:
                createClientID(),

            to:
                currentChatUser.username,

            text,

            image:
                "",

            time:
                Date.now(),

            reply:
                replyingTo
                    ? {
                        username:
                            replyingTo.username ||
                            "",

                        text:
                            String(
                                replyingTo.text ||
                                ""
                            ).slice(
                                0,
                                1000
                            )
                    }
                    : null
        };

        socket.emit(
            "private_message",
            message
        );

        messageInput.value =
            "";

        if (sendButton) {
            sendButton.disabled =
                true;
        }

        cancelReplyAction();

        stopTyping();
    }

    /* =====================================================
       SEND IMAGE
    ===================================================== */

    function sendImageFile(file) {

        if (!file) {
            return;
        }

        if (
            !currentUser ||
            !currentChatUser
        ) {
            return;
        }

        if (!socket?.connected) {

            alert(
                "Chưa kết nối máy chủ."
            );

            return;
        }

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {

            alert(
                "Vui lòng chọn file ảnh."
            );

            return;
        }

        if (
            file.size >
            7 * 1024 * 1024
        ) {

            alert(
                "Ảnh quá lớn. Tối đa 7MB."
            );

            return;
        }

        const reader =
            new FileReader();

        reader.onload = () => {

            const image =
                String(
                    reader.result || ""
                );

            socket.emit(
                "private_message",
                {

                    id:
                        createClientID(),

                    to:
                        currentChatUser.username,

                    text:
                        "",

                    image,

                    time:
                        Date.now(),

                    reply:
                        replyingTo
                            ? {
                                username:
                                    replyingTo.username ||
                                    "",

                                text:
                                    String(
                                        replyingTo.text ||
                                        ""
                                    ).slice(
                                        0,
                                        1000
                                    )
                            }
                            : null
                }
            );

            cancelReplyAction();
        };

        reader.onerror = () => {

            alert(
                "Không đọc được ảnh."
            );
        };

        reader.readAsDataURL(
            file
        );
    }

    /* =====================================================
       TYPING
    ===================================================== */

    function startTyping() {

        if (
            !socket?.connected ||
            !currentChatUser
        ) {
            return;
        }

        socket.emit(
            "typing",
            {
                to:
                    currentChatUser.username,

                stopped:
                    false
            }
        );

        clearTimeout(
            typingTimer
        );

        typingTimer =
            setTimeout(
                stopTyping,
                1200
            );
    }

    function stopTyping() {

        clearTimeout(
            typingTimer
        );

        if (
            socket?.connected &&
            currentChatUser
        ) {

            socket.emit(
                "typing",
                {
                    to:
                        currentChatUser.username,

                    stopped:
                        true
                }
            );
        }
    }

    /* =====================================================
       REPLY
    ===================================================== */

    function setReply(message) {

        replyingTo =
            message;

        replyBar?.classList.remove(
            "hidden"
        );

        if (replyUsername) {

            replyUsername.textContent =
                message.username ||
                "User";
        }

        if (replyPreview) {

            replyPreview.textContent =
                message.text ||
                "Ảnh";
        }

        messageInput?.focus();
    }

    function cancelReplyAction() {

        replyingTo =
            null;

        replyBar?.classList.add(
            "hidden"
        );

        if (replyUsername) {

            replyUsername.textContent =
                "User";
        }

        if (replyPreview) {

            replyPreview.textContent =
                "Tin nhắn...";
        }
    }

    /* =====================================================
       UPDATE USER AVATAR
    ===================================================== */

    function updateUserAvatar(
        username,
        avatar
    ) {

        if (!username) {
            return;
        }

        /* -----------------------------------------------
           FRIEND LIST
        ------------------------------------------------ */

        document
            .querySelectorAll(
                ".dm-user"
            )
            .forEach(element => {

                if (
                    normalize(
                        element.dataset.user
                    ) !==
                    normalize(username)
                ) {
                    return;
                }

                const target =
                    element.querySelector(
                        ".dm-avatar"
                    );

                if (!target) {
                    return;
                }

                target.innerHTML =
                    renderAvatar(
                        avatar,
                        username
                    );

                const presence =
                    document.createElement(
                        "i"
                    );

                presence.className =
                    "presence";

                const oldPresence =
                    element.querySelector(
                        ".presence.online"
                    );

                if (oldPresence) {

                    presence.classList.add(
                        "online"
                    );
                }

                target.appendChild(
                    presence
                );
            });

        /* -----------------------------------------------
           MESSAGE AVATAR
        ------------------------------------------------ */

        document
            .querySelectorAll(
                ".message-row"
            )
            .forEach(row => {

                if (
                    normalize(
                        row.dataset.username
                    ) !==
                    normalize(username)
                ) {
                    return;
                }

                const avatarElement =
                    row.querySelector(
                        ".message-avatar"
                    );

                if (!avatarElement) {
                    return;
                }

                avatarElement.innerHTML =
                    renderAvatar(
                        avatar,
                        username
                    );
            });
    }

    /* =====================================================
       PRESENCE
    ===================================================== */

    function updatePresence(
        username,
        online
    ) {

        document
            .querySelectorAll(
                ".dm-user"
            )
            .forEach(item => {

                if (
                    normalize(
                        item.dataset.user
                    ) !==
                    normalize(username)
                ) {
                    return;
                }

                const presence =
                    item.querySelector(
                        ".presence"
                    );

                presence?.classList.toggle(
                    "online",
                    !!online
                );

                const small =
                    item.querySelector(
                        ".dm-user-info small"
                    );

                if (small) {

                    small.textContent =
                        online
                            ? "Đang hoạt động"
                            : "Offline";
                }
            });
    }

    /* =====================================================
       ADD FRIEND MODAL
    ===================================================== */

    openAddFriend?.addEventListener(
        "click",
        () => {

            addFriendModal?.classList.remove(
                "hidden"
            );

            friendUsername?.focus();
        }
    );

    closeAddFriend?.addEventListener(
        "click",
        () => {

            addFriendModal?.classList.add(
                "hidden"
            );

            setMessage(
                friendMessage,
                ""
            );
        }
    );

    addFriendModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                addFriendModal
            ) {

                addFriendModal.classList.add(
                    "hidden"
                );
            }
        }
    );

    function sendFriend() {

        if (!socket?.connected) {

            setMessage(
                friendMessage,
                "Chưa kết nối máy chủ."
            );

            return;
        }

        const username =
            friendUsername?.value
                ?.trim() || "";

        if (!username) {

            setMessage(
                friendMessage,
                "Nhập username."
            );

            return;
        }

        if (
            normalize(username) ===
            normalize(
                currentUser?.username
            )
        ) {

            setMessage(
                friendMessage,
                "Không thể kết bạn với chính mình."
            );

            return;
        }

        socket.emit(
            "friend_request",
            {
                username
            }
        );
    }

    sendFriendRequest?.addEventListener(
        "click",
        sendFriend
    );

    friendUsername?.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                sendFriend();
            }
        }
    );

    /* =====================================================
       SEARCH
    ===================================================== */

    friendSearch?.addEventListener(
        "input",
        renderFriends
    );

    /* =====================================================
       MESSAGE INPUT
    ===================================================== */

    messageInput?.addEventListener(
        "input",
        () => {

            const hasText =
                !!messageInput.value.trim();

            if (sendButton) {

                sendButton.disabled =
                    !hasText ||
                    !currentChatUser ||
                    !socket?.connected;
            }

            if (hasText) {

                startTyping();

            } else {

                stopTyping();
            }
        }
    );

    messageInput?.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();
            }
        }
    );

    sendButton?.addEventListener(
        "click",
        sendMessage
    );

    /* =====================================================
       IMAGE INPUT
    ===================================================== */

    imageButton?.addEventListener(
        "click",
        () => {

            if (!currentChatUser) {

                alert(
                    "Hãy chọn một người trước."
                );

                return;
            }

            imageInput?.click();
        }
    );

    imageInput?.addEventListener(
        "change",
        () => {

            const file =
                imageInput.files?.[0];

            if (file) {
                sendImageFile(file);
            }

            imageInput.value = "";
        }
    );

    cancelReply?.addEventListener(
        "click",
        cancelReplyAction
    );

    /* =====================================================
       SETTINGS
    ===================================================== */

    settingsButton?.addEventListener(
        "click",
        () => {

            settingsModal?.classList.remove(
                "hidden"
            );
        }
    );

    closeSettings?.addEventListener(
        "click",
        () => {

            settingsModal?.classList.add(
                "hidden"
            );
        }
    );

    settingsModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                settingsModal
            ) {

                settingsModal.classList.add(
                    "hidden"
                );
            }
        }
    );

    /* =====================================================
       SETTINGS TABS
    ===================================================== */

    document
        .querySelectorAll(
            ".settings-tab"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const page =
                        button.dataset.page;

                    document
                        .querySelectorAll(
                            ".settings-tab"
                        )
                        .forEach(item => {

                            item.classList.toggle(
                                "active",
                                item === button
                            );
                        });

                    document
                        .querySelectorAll(
                            ".settings-page"
                        )
                        .forEach(item => {

                            item.classList.toggle(
                                "hidden",
                                item.id !==
                                `page-${page}`
                            );
                        });
                }
            );
        });

    /* =====================================================
       USERNAME
    ===================================================== */

    changeUsernameButton?.addEventListener(
        "click",
        () => {

            if (!socket?.connected) {

                setMessage(
                    usernameMessage,
                    "Chưa kết nối máy chủ."
                );

                return;
            }

            const value =
                newUsername?.value
                    ?.trim() || "";

            if (
                value.length < 2 ||
                value.length > 30
            ) {

                setMessage(
                    usernameMessage,
                    "Username phải từ 2 đến 30 ký tự."
                );

                return;
            }

            socket.emit(
                "change_username",
                {
                    username: value
                }
            );
        }
    );

    /* =====================================================
       AVATAR COLLECTION
    ===================================================== */

    document
        .querySelectorAll(
            ".collection-avatar"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const avatar =
                        button.dataset.avatar;

                    if (avatar) {
                        updateAvatar(
                            avatar
                        );
                    }
                }
            );
        });

    /* =====================================================
       AVATAR UPLOAD
    ===================================================== */

    avatarUpload?.addEventListener(
        "change",
        () => {

            const file =
                avatarUpload.files?.[0];

            if (!file) {
                return;
            }

            if (
                !file.type.startsWith(
                    "image/"
                )
            ) {

                alert(
                    "Vui lòng chọn file ảnh."
                );

                avatarUpload.value =
                    "";

                return;
            }

            if (
                file.size >
                7 * 1024 * 1024
            ) {

                alert(
                    "Avatar tối đa 7MB."
                );

                avatarUpload.value =
                    "";

                return;
            }

            const reader =
                new FileReader();

            reader.onload = () => {

                const avatar =
                    String(
                        reader.result || ""
                    );

                currentUser.avatar =
                    avatar;

                updateCurrentUserUI();

                updateAvatar(
                    avatar
                );
            };

            reader.onerror = () => {

                alert(
                    "Không đọc được ảnh."
                );
            };

            reader.readAsDataURL(
                file
            );

            avatarUpload.value =
                "";
        }
    );

    function updateAvatar(
        avatar
    ) {

        if (!socket?.connected) {

            alert(
                "Chưa kết nối máy chủ."
            );

            return;
        }

        socket.emit(
            "update_avatar",
            {
                avatar
            }
        );
    }

    /* =====================================================
       DARK MODE
    ===================================================== */

    darkToggle?.addEventListener(
        "change",
        () => {

            const dark =
                darkToggle.checked;

            document.body.classList.toggle(
                "light-mode",
                !dark
            );

            localStorage.setItem(
                "m4_dark_mode",
                dark
                    ? "dark"
                    : "light"
            );
        }
    );

    if (
        localStorage.getItem(
            "m4_dark_mode"
        ) === "light"
    ) {

        if (darkToggle) {
            darkToggle.checked =
                false;
        }

        document.body.classList.add(
            "light-mode"
        );
    }

    /* =====================================================
       SOUND
    ===================================================== */

    soundButton?.addEventListener(
        "click",
        () => {

            soundEnabled =
                !soundEnabled;

            soundButton.textContent =
                soundEnabled
                    ? "🔊"
                    : "🔇";

            if (soundToggle) {

                soundToggle.checked =
                    soundEnabled;
            }
        }
    );

    soundToggle?.addEventListener(
        "change",
        () => {

            soundEnabled =
                soundToggle.checked;

            if (soundButton) {

                soundButton.textContent =
                    soundEnabled
                        ? "🔊"
                        : "🔇";
            }
        }
    );

    function playMessageSound() {

        if (!soundEnabled) {
            return;
        }

        try {

            const AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContext) {
                return;
            }

            const context =
                new AudioContext();

            const oscillator =
                context.createOscillator();

            const gain =
                context.createGain();

            oscillator.frequency.value =
                700;

            gain.gain.value =
                0.035;

            oscillator.connect(
                gain
            );

            gain.connect(
                context.destination
            );

            oscillator.start();

            oscillator.stop(
                context.currentTime +
                0.08
            );

        } catch {}
    }

    /* =====================================================
       LOGOUT
    ===================================================== */

    logoutButton?.addEventListener(
        "click",
        async () => {

            try {

                socket?.emit(
                    "logout"
                );

                await fetch(
                    "/api/logout",
                    {
                        method: "POST",
                        credentials: "include"
                    }
                );

            } catch (error) {

                console.error(
                    "[LOGOUT]",
                    error
                );

            } finally {

                try {
                    socket?.disconnect();
                } catch {}

                window.location.replace(
                    "/login.html"
                );
            }
        }
    );

    /* =====================================================
       DEFAULT USERS
    ===================================================== */

    if (defaultFriends) {

        defaultFriends
            .querySelectorAll(
                ".dm-user"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const username =
                            button.dataset.user;

                        if (!username) {
                            return;
                        }

                        try {

                            const data =
                                await requestJSON(
                                    `/api/user/${encodeURIComponent(
                                        username
                                    )}`
                                );

                            if (data?.user) {

                                openChat(
                                    data.user
                                );
                            }

                        } catch {

                            alert(
                                `Không tìm thấy tài khoản "${username}".`
                            );
                        }
                    }
                );
            });
    }

    /* =====================================================
       ESC
    ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                addFriendModal?.classList.add(
                    "hidden"
                );

                settingsModal?.classList.add(
                    "hidden"
                );

                cancelReplyAction();
            }
        }
    );

    /* =====================================================
       START APP
    ===================================================== */

    async function startApp() {

        if (initialized) {
            return;
        }

        initialized =
            true;

        showLoadingState();

        const loggedIn =
            await loadCurrentUser();

        if (!loggedIn) {
            return;
        }

        updateCurrentUserUI();

        connectSocket();

        await loadFriends();

        await loadFriendRequests();

        console.log(
            "[M4 CHAT] App started:",
            currentUser.username
        );
    }

    startApp();
});
