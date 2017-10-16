declare module 'recast' {
	import recast = require('recast/main');

	export = recast;
}

declare module 'recast/main' {
	import {
		BaseNode, Program, Comment, Literal, Identifier, CallExpression, ExpressionStatement, VariableDeclaration
	} from 'estree';

	namespace recast {
		interface NamedType<T> {
			check(node: BaseNode): node is T;
		}

		interface AST {
			program: Program;
		}

		interface Path<T extends BaseNode = BaseNode> {
			value: any;
			node: T;
			parentPath: Path<BaseNode>;
			name: string;
			replace(node: BaseNode | null): void;
		}

		interface VisitFunction<T extends BaseNode = BaseNode> {
			(this: { traverse(path: Path<BaseNode>): void }, path: Path<T>): void | false;
		}

		namespace types {
			export const namedTypes: {
				// Not an exhaustive list
				Literal: NamedType<Literal>,
				Identifier: NamedType<Identifier>;
				CallExpression: NamedType<CallExpression>;
			};
			export const builders: {
				commentLine(comment: string, trailing?: boolean, leading?: boolean): Comment;
				literal(value: boolean | string | number | null | RegExp): Literal;
			};
			export function visit(ast: AST, visitCallbacks: Partial<{
				// Not an exhaustive list
				visitExpressionStatement: VisitFunction<ExpressionStatement>;
				visitVariableDeclaration: VisitFunction<VariableDeclaration>;
			}>): void;
		}

		function visit(visitCallbacks: {
			visitExpressionStatement: string;
		}): void;

		function parse(code: string, options?: { sourceFileName: string }): AST;

		function print(ast: AST, options?: { sourceMapName: string }): { code: string, map: any };
	}

	export = recast;
}

declare module 'recast/lib/util' {
	export function composeSourceMaps(sourceMap: { file: string}, map: any): any;
}
