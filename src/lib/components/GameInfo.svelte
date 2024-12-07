<script lang="ts">
    export let timeWhite: number;
    export let timeBlack: number;
    export let capturedPieces: { white: string[]; black: string[] };
    export let currentTurn: 'w' | 'b';
    export let gameRole: 'white' | 'black' | 'spectator' | null = null;
    
    function formatTime(ms: number): string {
        if (!ms) return '10:00';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function getPieceSymbol(piece: string): string {
        const symbols: { [key: string]: string } = {
            'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
            'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
        };
        return symbols[piece] || piece;
    }

    $: isYourTurn = (currentTurn === 'w' && gameRole === 'white') || 
                    (currentTurn === 'b' && gameRole === 'black');
</script>

<div class="game-info-panel">
    <div class="timer-container">
        <div class="player-info black">
            <div class="time-display {currentTurn === 'b' ? 'active' : ''}" class:your-turn={currentTurn === 'b' && gameRole === 'black'}>
                {formatTime(timeBlack)}
                {#if currentTurn === 'b' && gameRole === 'black'}
                    <span class="turn-indicator">YOUR TURN</span>
                {/if}
            </div>
        </div>
        
        <div class="player-info white">
            <div class="time-display {currentTurn === 'w' ? 'active' : ''}" class:your-turn={currentTurn === 'w' && gameRole === 'white'}>
                {formatTime(timeWhite)}
                {#if currentTurn === 'w' && gameRole === 'white'}
                    <span class="turn-indicator">YOUR TURN</span>
                {/if}
            </div>
        </div>
    </div>

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
</div>

<style>
    .game-info-panel {
        width: 100%;
        max-width: min(80vw, 600px);
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background: var(--color-bg-panel);
        border-radius: 8px;
        padding: 1rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .timer-container {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
    }

    .player-info {
        flex: 1;
    }
    
    .time-display {
        font-family: var(--font-mono);
        font-size: 1.5rem;
        font-weight: bold;
        padding: 0.5rem 1rem;
        text-align: center;
        border-radius: 4px;
        background: var(--color-bg-time);
        transition: all 0.3s;
        position: relative;
    }
    
    .time-display.active {
        background: var(--color-bg-time-active);
        color: var(--color-text-time-active);
    }

    .time-display.your-turn {
        box-shadow: 0 0 0 2px #4CAF50;
    }

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

    .black .piece {
        color: var(--color-piece-black);
    }

    .white .piece {
        color: var(--color-piece-white);
    }
</style> 