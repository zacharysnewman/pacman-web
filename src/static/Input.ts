import { gameState } from '../game-state';
import type { Direction } from '../types';

export class Input {
    static leftPressed = false;
    static rightPressed = false;
    static upPressed = false;
    static downPressed = false;
    static bufferedDir: Direction | null = null;
    static bufferedDirFramesLeft = 0;
    static readonly BUFFER_FRAMES = 8;

    static checkKeyDown(e: KeyboardEvent): void {
        switch (e.key) {
            case 'ArrowLeft':  Input.leftPressed = true;  break;
            case 'ArrowUp':    Input.upPressed = true;    break;
            case 'ArrowRight': Input.rightPressed = true; break;
            case 'ArrowDown':  Input.downPressed = true;  break;
        }
    }

    static checkKeyUp(e: KeyboardEvent): void {
        switch (e.key) {
            case 'ArrowLeft':  Input.leftPressed = false;  break;
            case 'ArrowUp':    Input.upPressed = false;    break;
            case 'ArrowRight': Input.rightPressed = false; break;
            case 'ArrowDown':  Input.downPressed = false;  break;
        }
    }

    static update(): void {
        const pacman = gameState.pacman;

        // Keyboard: check each frame while key is held
        if (Input.leftPressed  && (pacman.leftObject()   ?? 0) > 2) pacman.moveDir = 'left';
        if (Input.upPressed    && (pacman.topObject()    ?? 0) > 2) pacman.moveDir = 'up';
        if (Input.rightPressed && (pacman.rightObject()  ?? 0) > 2) pacman.moveDir = 'right';
        if (Input.downPressed  && (pacman.bottomObject() ?? 0) > 2) pacman.moveDir = 'down';

        // Touch: retry each frame until the turn is valid or the buffer expires
        if (Input.bufferedDir !== null) {
            const dir = Input.bufferedDir;
            const tileOpen =
                dir === 'left'  ? (pacman.leftObject()   ?? 0) > 2 :
                dir === 'right' ? (pacman.rightObject()  ?? 0) > 2 :
                dir === 'up'    ? (pacman.topObject()    ?? 0) > 2 :
                                  (pacman.bottomObject() ?? 0) > 2;
            if (tileOpen) {
                pacman.moveDir = dir;
                Input.bufferedDir = null;
                Input.bufferedDirFramesLeft = 0;
            } else {
                Input.bufferedDirFramesLeft--;
                if (Input.bufferedDirFramesLeft <= 0) {
                    Input.bufferedDir = null;
                }
            }
        }
    }
}
