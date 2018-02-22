'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';

type Disposable = {
  dispose(): any;
};

export function activate(context: vscode.ExtensionContext) {

  const gitExt = vscode.extensions.getExtension('vscode.git');

  if (!gitExt) {
    vscode.window.showErrorMessage('Git extension not found!');
    return;
  }

  const authoring = new CoAuthoring(gitExt.exports);
  context.subscriptions.push(authoring);
}

export function deactivate() {
}

class Buddy {
  public name: string;
  public email: string;

  constructor (name: string, email: string) {
    this.name = name;
    this.email = email;
  }

  toProperString () {
    return `${this.name} ${this.email}`;
  }
}

function parseBuddy(raw: string) : Buddy | undefined {
  const result = raw.split(/(<.+@.+>)/g);

  if (result !== null) {
    return new Buddy(result[0], result[1]);
  }
}

class CoAuthoring {
  private disposables: Disposable[];
  private started: boolean;
  private pairing: boolean;
  private pairingWith: Map<String, Buddy>;
  private gitApi: any;

  constructor (gitApi: any) {
    this.pairing = false;
    this.started = false;
    this.gitApi = gitApi;
    this.pairingWith = new Map();
    this.disposables = [];

    const startPairing = vscode.commands.registerCommand('extension.startPairing', this.startPairing, this);
    const stopPairing = vscode.commands.registerCommand('extension.stopPairing', this.stopPairing, this);

    this.disposables.push(startPairing);
    this.disposables.push(stopPairing);
  }

  public startPairing () {
    this.pairing = true;
    this._getRepos();
  }

  public stopPairing () {
    this.pairing = false;
  }

  public isPairing () {
    return this.pairing;
  }

  public toggleBuddy (partner: Buddy) {
    if (this.pairingWith.has(partner.email)) {
      this.pairingWith.delete(partner.email);
    } else {
      this.pairingWith.set(partner.email, partner);
    }
  }

  public getPairingString () {
    return [ ...this.pairingWith.values() ]
      .map(buddy => `Co-authored-by ${buddy.toProperString()}`)
      .join('\n');
  }

  public dispose () {
    this.disposables.forEach(e => e.dispose());
  }

  private async _pickBuddy (candidates: Buddy[]) {
    if (candidates.length === 0) {
      return;
    }

    const buddies = this.pairingWith;
    const users = candidates
      .sort(function (candidateA, candidateB) {
        if (buddies.has(candidateA.email)) {
          return -1;
        } else if (buddies.has(candidateB.email)) {
          return 1;
        }

        return 0;
      })
      .map(candidate => {
        if (buddies.has(candidate.email)) {
          return `✓${candidate.toProperString()}`;
        } else {
          return candidate.toProperString();
        }
      });

    const who = await vscode.window.showQuickPick(users);

    if (who !== undefined) {
      const buddy = parseBuddy(who);
      if (buddy !== undefined) {
        this.toggleBuddy(buddy);
      }
    }
  }

  private async _getRepos() {
    const repos = await this.gitApi.getRepositories();

    if (repos.length > 0) {
      cp.exec(`cd ${repos[0].rootUri.fsPath} && git log --pretty="%an <%ae>" | sort | uniq`, (error, stdout, stderr) => {
        this._pickBuddy(
          stdout
            .split('\n')
            .map(parseBuddy)
            .filter(function (buddy) : buddy is Buddy {
              return buddy !== undefined;
            })
        );
      });
    }
  }
}
