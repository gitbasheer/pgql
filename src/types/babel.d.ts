import type { Visitor } from '@babel/traverse';
import type * as t from '@babel/types';

declare module '@babel/traverse' {
  export default function traverse(
    parent: t.Node | t.Node[] | null | undefined,
    opts: Visitor<any> | undefined,
    scope?: any,
    state?: any,
    parentPath?: any,
  ): void;

  export function traverse(
    parent: t.Node | t.Node[] | null | undefined,
    opts: Visitor<any> | undefined,
    scope?: any,
    state?: any,
    parentPath?: any,
  ): void;
}
