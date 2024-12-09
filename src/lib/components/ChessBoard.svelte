/**
 * ChessBoard Component
 * Interactive chess board with move validation and piece movement
 * Supports multiple player roles and game states
 */

<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Chess } from 'chess.js';
    import type { Square } from 'chess.js';

    // Component props
    export let fen: string;                                         // Current board position in FEN notation
    export let gameRole: 'white' | 'black' | 'spectator' | null = null;  // Player's role in the game
    export let lastMove: { from: string; to: string } | null = null;     // Last move made in the game
    export let validMoves: string[] = [];                                // Valid moves for selected piece
    export let timeWhite: number;                                        // Remaining time for white player
    export let timeBlack: number;                                        // Remaining time for black player

    const dispatch = createEventDispatcher();
    let selectedSquare: Square | null = null;
    let board: Chess;

    // Initialize chess.js instance when FEN changes
    $: {
        board = new Chess(fen);
    }

    // Board layout constants
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    /**
     * Converts chess piece to Unicode symbol
     * @param piece - Chess piece object with type and color
     * @returns Unicode symbol for the piece
     */
    function getPieceSymbol(piece: { type: string, color: string }): string {
        const symbols: { [key: string]: string } = {
            'p': piece.color === 'w' ? '♙' : '♟',
            'n': piece.color === 'w' ? '♘' : '♞',
            'b': piece.color === 'w' ? '♗' : '♝',
            'r': piece.color === 'w' ? '♖' : '♜',
            'q': piece.color === 'w' ? '♕' : '♛',
            'k': piece.color === 'w' ? '♔' : '♚'
        };
        return symbols[piece.type] || '';
    }

    /**
     * Handles square click events
     * Manages piece selection and move execution
     * Validates player's turn and role
     * 
     * @param square - Clicked square coordinate (e.g., 'e4')
     */
    function handleSquareClick(square: string) {
        if (!gameRole || gameRole === 'spectator') return;

        if (selectedSquare === null) {
            const piece = board.get(square as Square);
            if (piece && ((piece.color === 'w' && gameRole === 'white') || 
                         (piece.color === 'b' && gameRole === 'black'))) {
                selectedSquare = square as Square;
                dispatch('squareSelect', { square });
            }
        } else {
            if (validMoves.includes(square)) {
                dispatch('move', { from: selectedSquare, to: square });
            }
            selectedSquare = null;
            validMoves = [];
        }
    }

    /**
     * Determines square color based on coordinates
     * @param file - File letter (a-h)
     * @param rank - Rank number (1-8)
     * @returns 'light' or 'dark'
     */
    function getSquareColor(file: string, rank: string): string {
        const fileIndex = files.indexOf(file);
        const rankIndex = ranks.indexOf(rank);
        return (fileIndex + rankIndex) % 2 === 0 ? 'light' : 'dark';
    }

    /**
     * Checks if a square is a valid move destination
     * @param square - Square coordinate to check
     */
    function isValidMove(square: string): boolean {
        return validMoves.includes(square);
    }

    /**
     * Checks if a move would capture an opponent's piece
     * @param square - Target square coordinate
     */
    function isCapturingMove(square: string): boolean {
        const targetPiece = board.get(square as Square);
        const selectedPiece = selectedSquare ? board.get(selectedSquare as Square) : null;
        return Boolean(selectedPiece && targetPiece && 
               targetPiece.color !== selectedPiece.color && 
               validMoves.includes(square));
    }

    /**
     * Checks if a square was part of the last move
     * @param square - Square coordinate to check
     */
    function isLastMove(square: string): boolean {
        if (!lastMove) return false;
        return square === lastMove.from || square === lastMove.to;
    }

    /**
     * Formats milliseconds into MM:SS display
     * @param ms - Time in milliseconds
     */
    function formatTime(ms: number): string {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
</script>

<div class="board-container">
    <div class="timers">
        <div class="timer white-timer">{formatTime(timeWhite)}</div>
        <div class="timer black-timer">{formatTime(timeBlack)}</div>
    </div>
    <div class="chess-board" class:flipped={gameRole === 'black'}>
        {#each ranks as rank}
            {#each files as file}
                {@const square = `${file}${rank}`}
                {@const piece = board.get(square as Square)}
                <div
                    class="square {getSquareColor(file, rank)}"
                    class:selected={square === selectedSquare}
                    class:valid-move={isValidMove(square)}
                    class:last-move={isLastMove(square)}
                    class:capture-move={isCapturingMove(square)}
                    data-square={square}
                    role="button"
                    tabindex="0"
                    aria-label="{piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type.toUpperCase()}` : ''} on {square}"
                    on:click={() => handleSquareClick(square)}
                    on:keydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            handleSquareClick(square);
                        }
                    }}
                >
                    {#if piece}
                        <div class="piece {piece.color === 'w' ? 'white' : 'black'}" style="transform: rotate({gameRole === 'black' ? '180deg' : '0deg'})">
                            {getPieceSymbol(piece)}
                        </div>
                    {/if}
                    {#if file === 'a'}
                        <div class="coordinate rank" style="transform: rotate({gameRole === 'black' ? '180deg' : '0deg'})">{rank}</div>
                    {/if}
                    {#if rank === '1'}
                        <div class="coordinate file" style="transform: rotate({gameRole === 'black' ? '180deg' : '0deg'})">{file}</div>
                    {/if}
                </div>
            {/each}
        {/each}
    </div>
</div>

<style>
    /* Board container and layout */
    .board-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    /* Timer styling */
    .timers {
        display: flex;
        justify-content: space-between;
        width: 100%;
    }

    .timer {
        background: #2c2c2c;
        color: #fff;
        padding: 8px 16px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 1.2rem;
    }

    /* Chess board grid */
    .chess-board {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        width: min(80vw, 600px);
        aspect-ratio: 1;
        border: 2px solid var(--color-border);
        background: var(--color-square-light);
        position: relative;
    }

    /* Board orientation for black player */
    .chess-board.flipped {
        transform: rotate(180deg);
    }

    /* Square styling */
    .square {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
        cursor: pointer;
        position: relative;
        transition: all 0.2s ease;
    }

    /* Square colors */
    .square.light {
        background-color: var(--board-classic-light, #f0d9b5);
    }

    .square.dark {
        background-color: var(--board-classic-dark, #b58863);
    }

    /* Square states */
    .square.selected {
        background-color: var(--color-selected, rgba(255, 255, 0, 0.5));
    }

    .square.valid-move::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 25%;
        height: 25%;
        border-radius: 50%;
        background-color: rgba(0, 0, 0, 0.2);
    }

    .square.valid-move.capture-move {
        border: 2px solid rgba(255, 68, 68, 0.7);
        box-shadow: 0 0 15px rgba(255, 0, 0, 0.4);
        animation: breathe 2s infinite;
    }

    .square.last-move {
        background-color: var(--color-last-move, rgba(0, 255, 0, 0.2));
    }

    /* Chess piece styling */
    .piece {
        width: 80%;
        height: 80%;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: transform 0.3s;
    }

    /* Piece colors with text shadow for visibility */
    .piece.white {
        color: #fff;
        text-shadow: 
            -1px -1px 0 #000,
            1px -1px 0 #000,
            -1px 1px 0 #000,
            1px 1px 0 #000;
    }

    .piece.black {
        color: #000;
        text-shadow: 
            -1px -1px 0 #fff,
            1px -1px 0 #fff,
            -1px 1px 0 #fff,
            1px 1px 0 #fff;
    }

    /* Board coordinates */
    .coordinate {
        position: absolute;
        font-size: 0.8rem;
        color: rgba(0, 0, 0, 0.7);
        pointer-events: none;
        font-family: var(--font-mono);
    }

    .coordinate.rank {
        left: 2px;
        top: 2px;
    }

    .coordinate.file {
        right: 2px;
        bottom: 2px;
    }

    .square.dark .coordinate {
        color: rgba(255, 255, 255, 0.9);
    }
</style> 