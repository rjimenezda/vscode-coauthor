'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';

type Disposable = {
  dispose(): any;
};

const SELECTED_CHAR = '✓';

export function activate(context: vscode.ExtensionContext) {

  const gitExt = vscode.extensions.getExtension('vscode.git');

  if (!gitExt) {
    vscode.window.showErrorMessage('Git extension not found!');
    return;
  }

  if (!gitExt.exports.getRepositories) {
    vscode.window.showErrorMessage('Git extension API incompatible');
    return;
  }

  const authoring = new CoAuthoring(gitExt.exports);
  context.subscriptions.push(authoring);
}

export function deactivate() {
}

class Repo {
  private path: string;
  private inputBox: vscode.SourceControlInputBox;

  constructor (path:string, input: vscode.SourceControlInputBox) {
    this.inputBox = input;
    this.path = "";
  }

  getPath () {
    return this.path;
  }
}

class CoAuthoring {
  private disposables: Disposable[] = [];
  private pairingSet: Set<string> = new Set();
  private repos: Map<string, Repo> = new Map();
  private gitApi: any;
  private currentRepo: string | undefined;

  constructor (gitApi: any) {
    this.gitApi = gitApi;

    const startPairing = vscode.commands.registerCommand('extension.addBuddy', this.startPairing, this);
    const stopPairing = vscode.commands.registerCommand('extension.stopPairing', this.stopPairing, this);
    const selectRepo = vscode.commands.registerCommand('extension.selectRepo', this.pickRepo, this);

    this.disposables.push(startPairing);
    this.disposables.push(stopPairing);
    this.disposables.push(selectRepo);
  }

  public async startPairing () {
    if (this.repos.size === 0) {
      await this._getRepos();
    }

    if (this.currentRepo === undefined) {
      await this.pickRepo();
    }

    this._getBuddies();
  }

  public stopPairing () {
    this.pairingSet.clear();
    this.currentRepo = undefined;
  }

  public selectRepo () {
    if (this.repos.size > 0) {
      this.pickRepo();
    }
  }

  public toggleBuddy (partner: string) {
    if (this.pairingSet.has(partner)) {
      this.pairingSet.delete(partner);
    } else {
      this.pairingSet.add(partner);
    }
  }

  public getPairingString () {
    return [ ...this.pairingSet.values() ]
      .map(buddy => `Co-authored-by ${buddy}`)
      .join('\n');
  }

  public dispose () {
    this.disposables.forEach(e => e.dispose());
  }

  private async _getBuddies () {
    if (this.currentRepo === undefined) {
      return;
    }

    // Get collaborators from selected repo
    cp.exec(`cd ${this.currentRepo} && git log --pretty="%an <%ae>"`, (error, stdout, stderr) => {
      this._pickBuddy(
        stdout
          .split('\n')
          // remove duplicates & empty lines
          .filter((line, index, self) => line.length === 0 || self.indexOf(line) === index)
      );
    });
  }

  private async _pickBuddy (candidates: string[]) {
    if (candidates.length === 0) {
      return;
    }

    const users = candidates
      // selected one first
      .sort((a, b) => {
        if (this.pairingSet.has(a)) {
          return -1;
        }

        if (this.pairingSet.has(b)) {
          return 1;
        }

        return 0;
      })
      .map((candidate, index) => {
        if (this.pairingSet.has(candidate)) {
          return `${SELECTED_CHAR}${candidate}`;
        } else {
          return candidate;
        }
      })

    let who = await vscode.window.showQuickPick(users);

    if (who !== undefined) {
      if (who.indexOf(SELECTED_CHAR) === 0) {
        who = who.substr(1);
      }
      this.toggleBuddy(who);
    }
  }

  private _addRepo (path: string, input: vscode.SourceControlInputBox) {
    if (this.repos.has(path)) {
      return;
    }

    const newRepo = new Repo(path, input);
    this.repos.set(path, newRepo);
  }

  private async pickRepo () {
    const repos = [ ...this.repos.entries() ];
    if (repos.length > 1) {
      this.currentRepo = await vscode.window.showQuickPick(
        repos
          .map(([value, repo]: [string, Repo]) => value)
      );
    }
  }

  private async _getRepos() {
    const repos = await this.gitApi.getRepositories();

    if (repos.length === 0) {
      vscode.window.showErrorMessage('No repositories found.');
      return;
    }

    // Add all repos, will update collection only if not present
    repos.forEach((repo: any) => {
      this._addRepo(repo.rootUri.fsPath, repo.inputBox);
    });
  }
}
