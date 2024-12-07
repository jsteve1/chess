<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { isDarkMode } from '$lib/stores/gameStore';

    export let gameRole: 'white' | 'black' | 'spectator' | null = null;
    export let currentTurn: 'w' | 'b' | null = null;
    export let playerCount: number = 0;
    export let gameStatus: 'waiting' | 'started' | 'ended' = 'waiting';

    const dispatch = createEventDispatcher();

    function toggleTheme() {
        isDarkMode.update(v => !v);
    }
</script>

<nav>
    <div class="navbar-content">
        <div class="left">
            <a href="/" class="logo">
                <span class="piece-symbol">♔</span>
                <span class="title">Chess Game</span>
            </a>
        </div>

        <div class="center">
            {#if gameStatus === 'waiting'}
                <span class="status waiting">Waiting for players ({playerCount}/2)</span>
            {:else if gameStatus === 'started'}
                <span class="status">
                    Playing as: {gameRole || 'Spectator'}
                    {#if gameRole !== 'spectator'}
                        • {currentTurn === 'w' ? "White's turn" : "Black's turn"}
                    {/if}
                </span>
            {:else}
                <span class="status ended">Game Ended</span>
            {/if}
        </div>

        <div class="right">
            <button class="theme-toggle" on:click={toggleTheme}>
                {$isDarkMode ? '☀️' : '🌙'}
            </button>
        </div>
    </div>
</nav>

<style>
    nav {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: var(--color-bg-nav, #1a1a1a);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        height: 60px;
    }

    .navbar-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 1rem;
        height: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .left, .right {
        flex: 1;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        text-decoration: none;
        color: inherit;
    }

    .piece-symbol {
        font-size: 1.75rem;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .title {
        font-size: 1.25rem;
        font-weight: 600;
    }

    .center {
        flex: 2;
        text-align: center;
    }

    .status {
        font-size: 1rem;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        background: rgba(50, 50, 50, 0.5);
        display: inline-block;
        min-width: 200px;
    }

    .status.waiting {
        color: #ffd700;
        animation: pulse 2s infinite;
    }

    .status.ended {
        color: #ff4444;
    }

    .right {
        display: flex;
        justify-content: flex-end;
    }

    .theme-toggle {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 4px;
        transition: all 0.2s;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .theme-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.1);
    }

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }

    :global(body.light-mode) nav {
        background: var(--color-bg-nav-light, #ffffff);
        color: var(--color-text-light);
    }

    :global(body.light-mode .piece-symbol) {
        color: #000;
    }

    @media (max-width: 600px) {
        .title {
            display: none;
        }

        .status {
            font-size: 0.875rem;
            min-width: 150px;
        }
    }
</style> 