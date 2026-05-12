type Listener<T> = (event: T) => void;

export class EventEmitter<T> {
	private listeners: Listener<T>[] = [];

	public event = (listener: Listener<T>): { dispose: () => void } => {
		this.listeners.push(listener);
		return {
			dispose: () => {
				this.listeners = this.listeners.filter((item) => item !== listener);
			},
		};
	};

	public fire(event: T): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}

export const TreeItemCollapsibleState = {
	None: 0,
	Collapsed: 1,
	Expanded: 2,
} as const;

export class TreeItem {
	public label: string;
	public collapsibleState: number;
	public description?: string;
	public tooltip?: string;
	public contextValue?: string;
	public command?: { command: string; title: string; arguments?: unknown[] };

	public constructor(label: string, collapsibleState: number) {
		this.label = label;
		this.collapsibleState = collapsibleState;
	}
}

export class Uri {
	public readonly scheme: string;
	public readonly authority: string;
	public readonly path: string;

	private constructor(scheme: string, authority: string, path: string) {
		this.scheme = scheme;
		this.authority = authority;
		this.path = path;
	}

	public static parse(value: string): Uri {
		const parsed = new URL(value);
		return new Uri(parsed.protocol.replace(':', ''), parsed.host, parsed.pathname);
	}

	public static from(parts: { scheme: string; authority?: string; path?: string }): Uri {
		return new Uri(parts.scheme, parts.authority ?? '', parts.path ?? '');
	}

	public toString(): string {
		const authority = this.authority ? `//${this.authority}` : '';
		return `${this.scheme}:${authority}${this.path}`;
	}
}

export const window = {
	showWarningMessage: jest.fn(),
	showErrorMessage: jest.fn(),
	showInformationMessage: jest.fn(),
	showInputBox: jest.fn(),
	showTextDocument: jest.fn(),
	registerTreeDataProvider: jest.fn(() => ({ dispose: jest.fn() })),
	registerUriHandler: jest.fn(() => ({ dispose: jest.fn() })),
	withProgress: jest.fn(async (_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) => {
		return task(
			{ report: jest.fn() },
			{ isCancellationRequested: false, onCancellationRequested: jest.fn() },
		);
	}),
};

export const ProgressLocation = {
	Notification: 15,
	Window: 10,
	SourceControl: 1,
} as const;

export const workspace = {
	getConfiguration: jest.fn(() => ({ get: jest.fn(() => '') })),
	openTextDocument: jest.fn(),
	registerTextDocumentContentProvider: jest.fn(() => ({ dispose: jest.fn() })),
	onWillSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
};

export const commands = {
	registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
	executeCommand: jest.fn(async () => undefined),
};

export const env = {
	openExternal: jest.fn(),
};

export const languages = {
	setTextDocumentLanguage: jest.fn(),
};
