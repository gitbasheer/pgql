declare module 'diff' {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  export function diffLines(oldStr: string, newStr: string): Change[];
  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
  ): string;
}
