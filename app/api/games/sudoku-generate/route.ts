import { NextRequest, NextResponse } from 'next/server';

import { withMetrics } from '@/lib/api-metrics';
// Sudoku Generator
class SudokuGenerator {
  private board: number[][];
  
  constructor() {
    this.board = Array(9).fill(0).map(() => Array(9).fill(0));
  }

  // Check if number is valid in position
  private isValid(row: number, col: number, num: number): boolean {
    // Check row
    for (let x = 0; x < 9; x++) {
      if (this.board[row][x] === num) return false;
    }
    
    // Check column
    for (let x = 0; x < 9; x++) {
      if (this.board[x][col] === num) return false;
    }
    
    // Check 3x3 box
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (this.board[i + startRow][j + startCol] === num) return false;
      }
    }
    
    return true;
  }

  // Fill the board using backtracking
  private fillBoard(): boolean {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] === 0) {
          // Shuffle numbers 1-9 for randomness
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
          
          for (const num of numbers) {
            if (this.isValid(row, col, num)) {
              this.board[row][col] = num;
              
              if (this.fillBoard()) {
                return true;
              }
              
              this.board[row][col] = 0;
            }
          }
          
          return false;
        }
      }
    }
    return true;
  }

  // Remove numbers to create puzzle
  private removeNumbers(difficulty: string): void {
    let cellsToRemove: number;
    
    switch (difficulty) {
      case 'easy':
        cellsToRemove = 30; // Remove 30 numbers
        break;
      case 'medium':
        cellsToRemove = 40; // Remove 40 numbers
        break;
      case 'hard':
        cellsToRemove = 50; // Remove 50 numbers
        break;
      default:
        cellsToRemove = 40;
    }

    while (cellsToRemove > 0) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);
      
      if (this.board[row][col] !== 0) {
        this.board[row][col] = 0;
        cellsToRemove--;
      }
    }
  }

  // Generate complete puzzle
  public generate(difficulty: string): { puzzle: string; solution: string } {
    // Generate complete solution
    this.fillBoard();
    const solution = this.boardToString();
    
    // Create puzzle by removing numbers
    this.removeNumbers(difficulty);
    const puzzle = this.boardToString();
    
    return { puzzle, solution };
  }

  // Convert board to string
  private boardToString(): string {
    return this.board.map(row => row.map(cell => cell === 0 ? '.' : cell.toString()).join('')).join('');
  }

  // Clone board for puzzle creation
  private cloneBoard(): number[][] {
    return this.board.map(row => [...row]);
  }
}

export const GET = withMetrics(async function GET(req: NextRequest) {
  try {
    const difficulty = req.nextUrl.searchParams.get('difficulty') || 'medium';
    
    // Generate new Sudoku puzzle
    const generator = new SudokuGenerator();
    const { puzzle, solution } = generator.generate(difficulty);
    
    return NextResponse.json({
      puzzle,
      solution,
      difficulty,
    });
  } catch (error) {
    console.error('Error generating Sudoku:', error);
    return NextResponse.json(
      { error: 'Failed to generate puzzle' },
      { status: 500 }
    );
  }
}
);
