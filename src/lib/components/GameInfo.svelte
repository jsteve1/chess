/**
 * GameInfo Component
 * Displays game status information including:
 * - Player timers
 * - Captured pieces
 * - Turn indicator
 * - Player roles
 */

<script lang="ts">
    // Component props
    export let timeWhite: number;                                    // Remaining time for white player
    export let timeBlack: number;                                    // Remaining time for black player
    export let capturedPieces: { white: string[]; black: string[] }; // Pieces captured by each side
    export let currentTurn: 'w' | 'b';                              // Current player's turn
    export let gameRole: 'white' | 'black' | 'spectator' | null = null;  // Player's role in the game
    
    /**
     * Formats milliseconds into MM:SS display
     * @param ms - Time in milliseconds
     */
    function formatTime(ms: number): string {
        if (!ms) return '10:00';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Converts piece letter to Unicode symbol
     * @param piece - Piece letter (e.g., 'P' for white pawn)
     */
    function getPieceSymbol(piece: string): string {
        const symbols: { [key: string]: string } = {
            'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
            'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
        };
        return symbols[piece] || piece;
    }

    // Reactive declaration for turn indicator
    $: isYourTurn = (currentTurn === 'w' && gameRole === 'white') || 
                    (currentTurn === 'b' && gameRole === 'black');
</script>

<div class="game-info-panel">
    <!-- Timer and player info for black player -->
    <div class="timer-container">
        <div class="player-info black">
            <div class="player-name">Black</div>
            <div class="timer">{formatTime(timeBlack)}</div>
            {#if currentTurn === 'b'}
                <div class="turn-indicator">
                    {#if gameRole === 'black'}
                        Your turn
                    {:else if gameRole === 'white'}
                        Opponent's turn
                    {:else}
                        Black's turn
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <!-- Captured pieces display -->
    <div class="captured-pieces-container">
        <div class="captured-pieces black">
            {#each capturedPieces.black as piece}
                <span class="piece">{getPieceSymbol(piece)}</span>
            {/each}
        </div>
        <div class="captured-pieces white">
            {#each capturedPieces.white as piece}
                <span class="piece">{getPieceSymbol(piece)}</span>
            {/each}
        </div>
    </div>

    <!-- Timer and player info for white player -->
    <div class="timer-container">
        <div class="player-info white">
            <div class="player-name">White</div>
            <div class="timer">{formatTime(timeWhite)}</div>
            {#if currentTurn === 'w'}
                <div class="turn-indicator">
                    {#if gameRole === 'white'}
                        Your turn
                    {:else if gameRole === 'black'}
                        Opponent's turn
                    {:else}
                        White's turn
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    /* Panel layout */
    .game-info-panel {
        width: 100%;
        max-width: 600px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        background: var(--color-bg-panel);
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        position: relative;
    }

    /* Timer container */
    .timer-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    /* Player info section */
    .player-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        background: var(--color-bg-player);
        border-radius: 4px;
        position: relative;
    }

    .player-name {
        font-weight: bold;
        color: var(--color-text);
    }

    .timer {
        font-family: monospace;
        font-size: 1.5rem;
        color: var(--color-text-timer);
    }

    /* Turn indicator */
    .turn-indicator {
        position: absolute;
        top: -1.5rem;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.875rem;
        font-weight: bold;
        color: #4CAF50;
        white-space: nowrap;
    }
    
    /* Captured pieces display */
    .captured-pieces-container {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
    }

    .captured-pieces {
        flex: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.5rem;
        min-height: 2rem;
        background: var(--color-bg-captured);
        border-radius: 4px;
    }
    
    .piece {
        font-size: 1.25rem;
        line-height: 1;
    }

    /* Piece colors */
    .black .piece {
        color: var(--color-piece-black);
    }

    .white .piece {
        color: var(--color-piece-white);
    }
</style> 