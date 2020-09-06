import * as net from 'net';

import * as vscode from 'vscode';

import {
	LanguageClient,
} from 'vscode-languageclient';

let client: LanguageClient | undefined;

interface EvalResponseSuccess {
	status: 'ok';
	value: string;
}

interface EvalResponseError {
	status: 'error';
	error: string;
	fullError: string[];
	traceback: string[];
}

type EvalResponse = EvalResponseSuccess | EvalResponseError;

class LyreContentProvider implements vscode.TextDocumentContentProvider {
	content = '';

	addText(text: string): vscode.Range {
		const lines = this.content.split('\n');
		const startLine = lines.length - 1;
		const startCol = lines[lines.length - 1].length;

		const newLines = text.split('\n');
		const lastNewLine = newLines[newLines.length - 1];

		const endLine = startLine + lines.length - 1;
		const endCol = newLines.length > 0 ? lastNewLine.length : startCol + lastNewLine.length;

		this.content += text;
		console.log(this.content);

		this.onDidChangeEmitter.fire(vscode.Uri.parse('lyre://SESSION/output'));

		return new vscode.Range(startLine, startCol, endLine, endCol);
	}

	onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;
	provideTextDocumentContent(
		uri: vscode.Uri,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<string> {
		return this.content + '\n'.repeat(20);
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const provider = new LyreContentProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('lyre', provider),
	);

	const replResultDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			border: '1px solid gray',
			margin: '10px',
		},
	});

	context.subscriptions.concat(
		vscode.workspace.onDidChangeTextDocument(e => {
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document === e.document) {
					editor.setDecorations(replResultDecorationType, []);
					break;
				}
			}
		}),
		vscode.commands.registerCommand('lyre-vscode.start', () => {
			vscode.window.showInformationMessage('Hello World from lyre!');
		}),
		vscode.commands.registerCommand('lyre-vscode.connect', async () => {
			const host = await vscode.window.showInputBox({
				prompt: 'host',
				value: 'localhost',
			});
			if (!host) {
				return;
			}

			const port = await vscode.window.showInputBox({
				prompt: 'port',
				value: '6768',
			});
			if (!port) {
				return;
			}

			client = new LanguageClient(
				'lyre',
				'Lyre',
				async () => {
					const conn = net.createConnection(parseInt(port), host);
					return {
						writer: conn,
						reader: conn,
						detached: true,
					};
				},
				{
					// client options?
				}
			);

			context.subscriptions.push(client.start());
			await client.onReady();
		}),
		vscode.commands.registerCommand('lyre-vscode.sendToRepl', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}

			if (!client) {
				editor.setDecorations(replResultDecorationType, []);
				return;
			}

			let sel: vscode.Range = editor.selection;
			if (sel.isEmpty) {
				sel = editor.document.lineAt(sel.start.line).range;
			}

			const code = editor.document.getText(sel);
			if (code === '') {
				editor.setDecorations(replResultDecorationType, []);
				return;
			}

			const response = await client.sendRequest<EvalResponse>('lyre/eval', {
				code,
				path: editor.document.fileName,
			});

			if (response.status === 'ok') {
				editor.setDecorations(replResultDecorationType, [{
					range: sel,
					renderOptions: {
						after: {
							contentText: '=> ' + response.value,
						},
					}
				}]);
			} else {
				editor.setDecorations(replResultDecorationType, [{
					range: sel,
					renderOptions: {
						after: {
							border: '1px solid red',
							contentText: '=> ' + response.error,
						},
					}
				}]);
			}

			// peek style output:
			// let outputDoc = await vscode.workspace.openTextDocument(
			// 	vscode.Uri.parse('lyre://SESSION/output'));

			// let outputRange: vscode.Range;
			// if (typeof (response as any).value !== 'undefined') {
			// 	outputRange = provider.addText((response as any).value + '\n');
			// } else {
			// 	outputRange = provider.addText((response as any).stack + '\n');
			// }

		  // await vscode.commands.executeCommand(
			// 	'editor.action.peekLocations',
			// 	editor.document.uri,
			// 	sel.end,
			// 	[new vscode.Location(
			// 		outputDoc.uri,
			// 		outputRange,
			// 	)],
			// 	'peek',
			// 	);

		}),
	);
}

export async function deactivate() { }
