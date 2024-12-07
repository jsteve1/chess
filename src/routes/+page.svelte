<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { io, type Socket } from 'socket.io-client';
    import ChessBoard from '$lib/components/ChessBoard.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import GameInfo from '$lib/components/GameInfo.svelte';
    import { Chess } from 'chess.js';
    import { writable } from 'svelte/store';
    import { isDarkMode } from '$lib/stores/gameStore';
    import { createSocket } from '$lib/socket';

    // Create game session store
    const gameSession = writable<{
        gameId: string;
        role: 'white' | 'black' | 'spectator';
        isPrivate: boolean;
    } | null>(null);

    let socket: Socket;
    let gameId: string | null = null;
    let joinGameId: string = '';
    let showJoinInput: boolean = false;
    let gameRole: 'white' | 'black' | 'spectator' | null = null;
    let whitePlayer: string | null = null;
    let blackPlayer: string | null = null;
    let playerCount: number = 0;
    let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let validMoves: string[] = [];
    let lastMove: { from: string; to: string } | null = null;
    let connectionError = false;
    let errorMessage: string | null = null;
    let boardTheme = 'classic';
    let pieceTheme = 'classic';
    let timeWhite = 15 * 60 * 1000;
    let timeBlack = 15 * 60 * 1000;
    let capturedPieces: { white: string[], black: string[] } = { white: [], black: [] };
    let currentTurn: 'w' | 'b' = 'w';
    let gameStarted = false;
    let timerInterval: ReturnType<typeof setInterval> | null = null;
    let gameStatus: 'waiting' | 'started' | 'ended' = 'waiting';
    let isInCheck = false;
    let isCheckmate = false;
    let showGameOverModal = false;
    let winner: 'white' | 'black' | null = null;
    let showPrivateGameForm = false;
    let gamePassword = '';
    let joinPassword = '';
    let isPrivateGame = false;
    let showPasswordInput = false;
    let passwordError = '';
    let errorTimeout: ReturnType<typeof setTimeout> | null = null;
    
    function updateTimers() {
        if (!gameStarted) return;
        
        if (currentTurn === 'w') {
            timeWhite = Math.max(0, timeWhite - 1000);
        } else {
            timeBlack = Math.max(0, timeBlack - 1000);
        }
    }
    
    function updateGameStatus() {
        if (!gameId) {
            gameStatus = 'waiting';
        } else if (playerCount === 2) {
            gameStatus = 'started';
        } else {
            gameStatus = 'waiting';
        }
    }
    
    function checkGameState(newFen: string) {
        try {
            const chess = new Chess();
            chess.load(newFen);
            isInCheck = chess.inCheck();
            isCheckmate = chess.isCheckmate();
            
            if (isCheckmate) {
                winner = chess.turn() === 'w' ? 'black' : 'white';
                showGameOverModal = true;
                gameStatus = 'ended';
            }
        } catch (error) {
            console.error('Error checking game state:', error);
        }
    }
    
    function resetGameState() {
        gameId = null;
        joinGameId = '';
        showJoinInput = false;
        gameRole = null;
        whitePlayer = null;
        blackPlayer = null;
        playerCount = 0;
        fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        validMoves = [];
        lastMove = null;
        errorMessage = null;
        gameStarted = false;
        gameStatus = 'waiting';
        showPrivateGameForm = false;
        gamePassword = '';
        joinPassword = '';
        isPrivateGame = false;
        showPasswordInput = false;
        passwordError = '';
        capturedPieces = { white: [], black: [] };
        gameSession.set(null);
    }
    
    function createGame(isPrivate = false) {
        resetGameState();
        if (isPrivate && (!gamePassword || gamePassword.length !== 4)) {
            passwordError = 'Please enter a 4-digit password';
            return;
        }
        
        socket.emit('create_game', { isPrivate, password: isPrivate ? gamePassword : null });
        showPrivateGameForm = false;
        gamePassword = '';
        passwordError = '';
    }
    
    function showError(message: string, duration = 5000) {
        errorMessage = message;
        if (errorTimeout) {
            clearTimeout(errorTimeout);
        }
        errorTimeout = setTimeout(() => {
            errorMessage = null;
        }, duration);
    }
    
    function joinGame() {
        if (!joinGameId) {
            showError('Please enter a game code');
            return;
        }
        
        // Reset any previous state but keep the joinGameId
        const tempGameId = joinGameId;
        resetGameState();
        joinGameId = tempGameId;
        
        if (showPasswordInput) {
            if (!joinPassword || joinPassword.length !== 4) {
                showError('Please enter a 4-digit password');
                return;
            }
            socket.emit('join_game', { gameId: joinGameId, password: joinPassword });
            joinPassword = '';
            showPasswordInput = false;
        } else {
            socket.emit('check_game_privacy', { gameId: joinGameId });
        }
    }
    
    onMount(async () => {
        try {
            // Theme handling
            isDarkMode.subscribe(value => {
                if (typeof document !== 'undefined') {
                    document.body.classList.toggle('light-mode', !value);
                }
            });

            // Socket setup
            socket = createSocket();

            // Start timer update interval
            timerInterval = setInterval(updateTimers, 1000);

            socket.on('connect', () => {
                console.log('Connected to server');
                connectionError = false;
                errorMessage = null;

                // If we have a game ID in the URL, try to join it
                const urlParams = new URLSearchParams(window.location.search);
                const urlGameId = urlParams.get('game');
                if (urlGameId) {
                    gameId = urlGameId;
                    joinGameId = urlGameId;
                    const token = localStorage.getItem(`chess_token_${urlGameId}`);
                    socket.emit('rejoin_game', { gameId: urlGameId, token });
                }
            });

            socket.on('error', (message: string) => {
                showError(message);
                console.error('Server error:', message);
            });

            socket.on('game_created', (data) => {
                console.log('Game created:', data);
                if (!data || !data.gameId) {
                    showError('Failed to create game');
                    return;
                }
                gameId = data.gameId;
                if (data.token) {
                    localStorage.setItem(`chess_token_${data.gameId}`, data.token);
                }
                window.history.pushState({}, '', `/?game=${data.gameId}`);
            });

            socket.on('game_joined', (data) => {
                console.log('Game joined:', data);
                if (!data) {
                    showError('Failed to join game');
                    return;
                }
                
                gameRole = data.role;
                fen = data.fen;
                lastMove = data.lastMove;
                if (data.timeLeft) {
                    timeWhite = data.timeLeft.white;
                    timeBlack = data.timeLeft.black;
                }
                isPrivateGame = data.isPrivate;
                errorMessage = null;
                showPasswordInput = false;
                showJoinInput = false;
                passwordError = '';

                if (!gameId) {
                    gameId = joinGameId;
                    window.history.pushState({}, '', `/?game=${joinGameId}`);
                }

                if (data.token) {
                    localStorage.setItem(`chess_token_${gameId}`, data.token);
                }

                gameSession.set({
                    gameId: gameId!,
                    role: data.role,
                    isPrivate: data.isPrivate
                });
            });

            socket.on('game_privacy_check', (data) => {
                if (!data) {
                    showError('Failed to check game privacy');
                    return;
                }
                
                if (data.isPrivate) {
                    showPasswordInput = true;
                    passwordError = '';
                } else {
                    socket.emit('join_game', { gameId: joinGameId });
                }
            });

            socket.on('player_joined', (data: {
                white: string | null;
                black: string | null;
                spectators: string[];
                timeLeft: { white: number; black: number };
                status: string;
            }) => {
                console.log('Player joined event:', data);
                whitePlayer = data.white;
                blackPlayer = data.black;
                playerCount = (data.white ? 1 : 0) + (data.black ? 1 : 0);
                gameStarted = data.status === 'playing';
                gameStatus = gameStarted ? 'started' : 'waiting';
                
                if (data.timeLeft) {
                    timeWhite = data.timeLeft.white;
                    timeBlack = data.timeLeft.black;
                }

                // Hide join UI if we're in a game
                if (gameId) {
                    showJoinInput = false;
                    showPrivateGameForm = false;
                }

                updateGameStatus();
            });

            socket.on('move_made', (data: {
                fen: string;
                from: string;
                to: string;
                timeLeft: { white: number; black: number };
            }) => {
                fen = data.fen;
                lastMove = { from: data.from, to: data.to };
                if (data.timeLeft) {
                    timeWhite = data.timeLeft.white;
                    timeBlack = data.timeLeft.black;
                }
                const [, turn] = data.fen.split(' ');
                currentTurn = turn as 'w' | 'b';
                updateCapturedPieces(data.fen);
                checkGameState(data.fen);
                errorMessage = null;
            });

            socket.on('player_left', (data: {
                white: string | null;
                black: string | null;
                spectators: string[];
            }) => {
                whitePlayer = data.white;
                blackPlayer = data.black;
                playerCount = (data.white ? 1 : 0) + (data.black ? 1 : 0);
                gameStarted = playerCount === 2;
                
                if (data.white === null && gameRole === 'black') {
                    errorMessage = 'White player has left the game';
                    gameStatus = 'ended';
                } else if (data.black === null && gameRole === 'white') {
                    errorMessage = 'Black player has left the game';
                    gameStatus = 'ended';
                }
                updateGameStatus();
            });

            socket.on('disconnect', () => {
                console.log('Disconnected from server');
                connectionError = true;
                errorMessage = 'Connection to server lost. Attempting to reconnect...';
            });

            socket.on('valid_moves', (data: { moves: string[] }) => {
                console.log('Valid moves received:', data);
                validMoves = data.moves || [];
            });

            socket.on('password_error', (message: string) => {
                passwordError = message;
            });

        } catch (error) {
            console.error('Failed to initialize socket:', error);
            connectionError = true;
            errorMessage = 'Failed to connect to server';
        }
    });
    
    onDestroy(() => {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
    });
    
    function handleMove(from: string, to: string) {
        if (!currentTurn || !gameRole || !gameStarted) return;
        console.log('Making move:', { from, to, role: gameRole, turn: currentTurn });
        socket.emit('make_move', { from, to });
    }
    
    function handleSquareSelect(square: string) {
        if (!gameRole || !gameStarted) return;
        console.log('Selecting square:', square);
        socket.emit('get_valid_moves', { square });
    }
    
    function updateCapturedPieces(newFen: string) {
        const pieces = newFen.split(' ')[0];
        const whitePieces = pieces.match(/[PNBRQK]/g) || [];
        const blackPieces = pieces.match(/[pnbrqk]/g) || [];
        
        // Count initial pieces
        const initialCount = {
            P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1,
            p: 8, n: 2, b: 2, r: 2, q: 1, k: 1
        };
        
        // Count current pieces
        const currentCount: { [key: string]: number } = {};
        [...whitePieces, ...blackPieces].forEach(piece => {
            currentCount[piece] = (currentCount[piece] || 0) + 1;
        });
        
        // Calculate captured pieces
        capturedPieces = {
            white: [],
            black: []
        };
        
        // Add white pieces captured by black
        Object.entries(initialCount)
            .filter(([piece]) => piece.toUpperCase() === piece) // White pieces
            .forEach(([piece, count]) => {
                const captured = count - (currentCount[piece] || 0);
                for (let i = 0; i < captured; i++) {
                    capturedPieces.white.push(piece);
                }
            });
        
        // Add black pieces captured by white
        Object.entries(initialCount)
            .filter(([piece]) => piece.toLowerCase() === piece) // Black pieces
            .forEach(([piece, count]) => {
                const captured = count - (currentCount[piece] || 0);
                for (let i = 0; i < captured; i++) {
                    capturedPieces.black.push(piece);
                }
            });
    }
    
    function handleBoardThemeChange(event: CustomEvent<string>) {
        boardTheme = event.detail;
    }
    
    function handlePieceThemeChange(event: CustomEvent<string>) {
        pieceTheme = event.detail;
    }
    
    function createNewGame() {
        showGameOverModal = false;
        socket.emit('create_game');
    }
    
    function handleThemeChange(event: CustomEvent<boolean>) {
        isDarkMode.set(event.detail);
    }

    // Add this after other onMount logic
    $: if (typeof document !== 'undefined') {
        document.body.classList.toggle('light-mode', !$isDarkMode);
    }
</script>

<div class="game-container">
    <Navbar 
        {gameRole}
        currentTurn={currentTurn}
        {playerCount}
        {gameStatus}
        on:boardThemeChange={handleBoardThemeChange}
        on:pieceThemeChange={handlePieceThemeChange}
        on:themeChange={handleThemeChange}
    />
    
    {#if connectionError}
        <div class="error-message">
            Unable to connect to server. Please check your connection and refresh the page.
        </div>
    {/if}
    
    {#if !gameId}
        <div class="menu-container">
            <button class="menu-btn" on:click={() => createGame(false)}>
                <span class="chess-icon">♔</span>
                Create New Game
            </button>
            <button class="menu-btn" on:click={() => showPrivateGameForm = !showPrivateGameForm}>
                <span class="chess-icon">♕</span>
                Create Private Game
            </button>
            
            {#if showPrivateGameForm}
                <div class="password-form">
                    <input 
                        type="password" 
                        maxlength="4"
                        placeholder="Enter 4-digit password"
                        bind:value={gamePassword}
                        on:keypress={(e) => {
                            if (e.key === 'Enter' && gamePassword.length === 4) {
                                createGame(true);
                            }
                        }}
                    />
                    <button class="menu-btn" on:click={() => createGame(true)}>Create</button>
                    {#if passwordError}
                        <div class="error">{passwordError}</div>
                    {/if}
                </div>
            {/if}

            <button class="menu-btn" on:click={() => showJoinInput = !showJoinInput}>
                <span class="chess-icon">♖</span>
                Join Match
            </button>
            
            {#if showJoinInput}
                <div class="join-container">
                    <input 
                        type="text" 
                        bind:value={joinGameId} 
                        placeholder="Enter game code"
                        on:keypress={(e) => e.key === 'Enter' && joinGame()}
                    />
                    {#if showPasswordInput}
                        <input 
                            type="password"
                            maxlength="4"
                            placeholder="Enter password"
                            bind:value={joinPassword}
                            on:keypress={(e) => {
                                if (e.key === 'Enter' && joinPassword.length === 4) {
                                    joinGame();
                                }
                            }}
                        />
                    {/if}
                    <button class="menu-btn" on:click={joinGame}>Join</button>
                </div>
                {#if errorMessage}
                    <div class="error-message">{errorMessage}</div>
                {/if}
            {/if}
        </div>
    {:else if !gameRole}
        <div class="loading-container">
            <a href="/" class="menu-btn" on:click|preventDefault={() => resetGameState()}>
                <span class="chess-icon">♔</span>
                Return Home
            </a>
            <div class="loading">No session Found</div>
        </div>
    {:else}
        <div class="game-header">
            <Navbar 
                {gameRole}
                currentTurn={currentTurn}
                {playerCount}
                {gameStatus}
            />
        </div>

        {#if !gameStarted && gameId}
            {#if playerCount < 2}
                <div class="join-info">
                    <h2>Share this game</h2>
                    <div class="code-display">
                        <span class="code">{gameId}</span>
                        <button class="copy-btn" on:click={() => {
                            navigator.clipboard.writeText(window.location.href);
                        }}>Copy Link</button>
                    </div>
                    <div class="qr-code">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={encodeURIComponent(window.location.href)}" 
                             alt="QR Code to join game" />
                    </div>
                </div>
            {/if}
        {/if}

        {#if isInCheck && !isCheckmate}
            <div class="check-alert">
                <span class="alert-text">
                    {gameRole === (currentTurn === 'w' ? 'white' : 'black') ? 
                        'You are in check!' : 
                        'Opponent is in check!'}
                </span>
            </div>
        {/if}

        <div class="game-layout" class:flipped={gameRole === 'black'}>
            {#if gameId}
                <div class="connection-status">
                    {#if playerCount === 2}
                        <span class="connected">Both players connected</span>
                    {:else}
                        <span class="waiting">Waiting for opponent...</span>
                    {/if}
                </div>
            {/if}
            <div class="board-container">
                <div class="captured-pieces left">
                    {#if gameRole === 'black'}
                        <div class="captured black">
                            {#if capturedPieces.black.length > 0}
                                {#each capturedPieces.black as piece}
                                    <span class="piece">{getPieceSymbol(piece, 'black')}</span>
                                {/each}
                            {:else}
                                <span class="empty">No captures</span>
                            {/if}
                        </div>
                    {:else}
                        <div class="captured white">
                            {#if capturedPieces.white.length > 0}
                                {#each capturedPieces.white as piece}
                                    <span class="piece">{getPieceSymbol(piece, 'white')}</span>
                                {/each}
                            {:else}
                                <span class="empty">No captures</span>
                            {/if}
                        </div>
                    {/if}
                </div>

                <ChessBoard
                    {fen}
                    gameRole={gameRole}
                    {lastMove}
                    {validMoves}
                    {timeWhite}
                    {timeBlack}
                    on:move={({ detail }) => handleMove(detail.from, detail.to)}
                    on:squareSelect={e => handleSquareSelect(e.detail.square)}
                />

                <div class="captured-pieces right">
                    {#if gameRole === 'black'}
                        <div class="captured white">
                            {#if capturedPieces.white.length > 0}
                                {#each capturedPieces.white as piece}
                                    <span class="piece">{getPieceSymbol(piece, 'white')}</span>
                                {/each}
                            {:else}
                                <span class="empty">No captures</span>
                            {/if}
                        </div>
                    {:else}
                        <div class="captured black">
                            {#if capturedPieces.black.length > 0}
                                {#each capturedPieces.black as piece}
                                    <span class="piece">{getPieceSymbol(piece, 'black')}</span>
                                {/each}
                            {:else}
                                <span class="empty">No captures</span>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        {#if showGameOverModal}
            <div class="modal-overlay">
                <div class="modal">
                    <h2>{winner === gameRole ? 'You Won!' : 'You Lost!'}</h2>
                    <p>{winner === 'white' ? 'White' : 'Black'} wins by checkmate!</p>
                    <button class="new-game-btn" on:click={createNewGame}>
                        Create New Game
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .game-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.5rem;
        gap: 0.5rem;
    }
    
    .game-header {
        width: 100%;
        max-width: 640px;
        margin-bottom: 0.5rem;
    }
    
    .join-container {
        display: flex;
        gap: 0.5rem;
    }
    
    input {
        padding: 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 1rem;
    }
    
    button {
        padding: 0.5rem 1rem;
        background-color: var(--color-theme-1);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    button:hover {
        background-color: var(--color-theme-2);
    }
    
    .loading {
        margin: 1rem 0;
        font-style: italic;
        color: #666;
    }

    .game-layout {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        margin-top: 60px;
    }

    .board-container {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .captured-pieces {
        width: 80px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .captured {
        background: #2c2c2c;
        border-radius: 4px;
        padding: 0.5rem;
        min-height: 100px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
    }

    .piece {
        font-size: 1.5rem;
        line-height: 1;
        transition: transform 0.2s;
    }

    .piece:hover {
        transform: scale(1.1);
    }

    .empty {
        color: #666;
        font-size: 0.8rem;
        font-style: italic;
    }

    @media (max-width: 768px) {
        .captured-pieces {
            display: none;
        }
    }

    .join-info {
        text-align: center;
        margin: 1rem 0;
        padding: 1rem;
        background: #2c2c2c;
        border-radius: 4px;
        max-width: 400px;
        margin: 1rem auto;
    }

    .join-info h2 {
        color: #ffffff;
        font-size: 1.5rem;
        margin-bottom: 1rem;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
    }

    .connection-status {
        text-align: center;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }

    .connection-status .connected {
        color: #4CAF50;
        font-weight: 500;
    }

    .connection-status .waiting {
        color: #FFA726;
        font-weight: 500;
    }

    .code-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin: 1rem 0;
    }

    .code {
        font-family: monospace;
        font-size: 1.5rem;
        padding: 0.5rem 1rem;
        background: #1a1a1a;
        border-radius: 4px;
        color: #fff;
    }

    .copy-btn {
        padding: 0.5rem 1rem;
        background: var(--color-theme-1);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        transition: background 0.2s;
    }

    .copy-btn:hover {
        background: var(--color-theme-2);
    }

    .qr-code {
        margin: 1rem 0;
    }

    .qr-code img {
        border-radius: 4px;
        background: white;
        padding: 0.5rem;
    }

    .check-alert {
        position: fixed;
        top: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff4444 0%, #ff0000 100%);
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        z-index: 1000;
        animation: pulse 2s infinite;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
        font-weight: 500;
        letter-spacing: 0.5px;
    }

    @keyframes pulse {
        0% { 
            transform: translateX(-50%) scale(1);
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
        }
        50% { 
            transform: translateX(-50%) scale(1.05);
            box-shadow: 0 0 30px rgba(255, 0, 0, 0.5);
        }
        100% { 
            transform: translateX(-50%) scale(1);
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
        }
    }

    @keyframes breathe {
        0% { 
            box-shadow: 0 0 15px rgba(255, 0, 0, 0.3);
            border-color: rgba(255, 68, 68, 0.6);
        }
        50% { 
            box-shadow: 0 0 25px rgba(255, 0, 0, 0.6);
            border-color: rgba(255, 68, 68, 0.9);
        }
        100% { 
            box-shadow: 0 0 15px rgba(255, 0, 0, 0.3);
            border-color: rgba(255, 68, 68, 0.6);
        }
    }

    :global(.capture-move) {
        animation: breathe 2s infinite !important;
        box-shadow: 0 0 15px rgba(255, 0, 0, 0.4) !important;
        border: 2px solid rgba(255, 68, 68, 0.7) !important;
        z-index: 5 !important;
    }

    :global(.capture-move::after) {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle, rgba(255, 0, 0, 0.15) 0%, transparent 70%);
        pointer-events: none;
        z-index: 1;
    }

    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    }

    .modal {
        background: #1a1a1a;
        padding: 2.5rem;
        border-radius: 12px;
        text-align: center;
        animation: slideIn 0.3s ease-out;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .modal h2 {
        font-size: 2.5rem;
        margin: 0 0 1rem 0;
        background: linear-gradient(135deg, #00ff87 0%, #60efff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 20px rgba(96, 239, 255, 0.5);
    }

    .modal p {
        color: #ffffff;
        font-size: 1.2rem;
        margin-bottom: 1.5rem;
    }

    .new-game-btn {
        margin-top: 1rem;
        padding: 0.75rem 1.5rem;
        font-size: 1.1rem;
        background: var(--color-theme-1);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        transition: background 0.2s;
    }

    .new-game-btn:hover {
        background: var(--color-theme-2);
    }

    @keyframes slideIn {
        from {
            transform: translateY(-20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .password-form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0.5rem 0;
    }

    .error {
        color: #ff4444;
        font-size: 0.875rem;
        margin-top: 0.25rem;
    }

    input[type="password"] {
        font-family: monospace;
        letter-spacing: 0.25em;
        text-align: center;
    }

    .join-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    @media (min-width: 768px) {
        .join-container {
            flex-direction: row;
        }
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        min-height: 60vh;
        padding: 2rem;
    }

    .loading {
        font-size: 1.5rem;
        color: #e2e8f0;
        font-weight: 500;
        text-align: center;
    }

    .menu-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: 60vh;
        padding: 2rem;
    }

    .menu-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 1.5rem;
        width: 280px;
        font-size: 1.1rem;
        font-weight: 500;
        color: white;
        text-decoration: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #2c5364, #203a43, #0f2027);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        cursor: pointer;
    }

    .menu-btn::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
        );
        transition: 0.5s;
    }

    .menu-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        background: linear-gradient(135deg, #3a7bd5, #2c5364, #0f2027);
    }

    .menu-btn:hover::before {
        left: 100%;
    }

    .chess-icon {
        font-size: 1.5rem;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
    }

    :global(body) {
        transition: background-color 0.3s ease, color 0.3s ease;
        background-color: var(--color-bg-main-dark);
        color: var(--color-text-dark);
    }

    :global(body.light-mode) {
        background-color: #f5f5f5;
        color: #1a1a1a;
    }

    :global(body.light-mode) .logo-title {
        color: #1a1a1a;
    }

    :global(body.light-mode) .chess-board {
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
    }

    /* Keep dark theme for these elements in light mode */
    :global(body.light-mode) .menu-btn,
    :global(body.light-mode) .modal,
    :global(body.light-mode) .modal p,
    :global(body.light-mode) input,
    :global(body.light-mode) .captured {
        background: var(--original-dark-bg, #2c2c2c);
        color: var(--original-dark-text, #fff);
    }
</style>

<script context="module">
    function getPieceSymbol(piece: string, color: 'white' | 'black'): string {
        const symbols: { [key: string]: string } = {
            'P': color === 'white' ? '♙' : '♟',
            'N': color === 'white' ? '♘' : '♞',
            'B': color === 'white' ? '♗' : '♝',
            'R': color === 'white' ? '♖' : '♜',
            'Q': color === 'white' ? '♕' : '♛',
            'K': color === 'white' ? '♔' : '♚'
        };
        return symbols[piece.toUpperCase()] || '';
    }
</script>

