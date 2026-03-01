/**
 * Registers built-in language-aware snippets for common patterns.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MonacoSnippetSuggestProvider } from '@theia/monaco/lib/browser/monaco-snippet-suggest-provider';

// ── Snippet definitions ──────────────────────────────────────────────────────

const TS_SNIPPETS = {
  'React Functional Component': {
    prefix: ['rfc', 'react-component'],
    body: [
      "export function ${1:Component}(${2:props}: ${3:Props}) {",
      '  return (',
      '    <div>',
      '      $0',
      '    </div>',
      '  );',
      '}',
    ],
    description: 'React functional component with TypeScript',
  },
  'Arrow Function': {
    prefix: ['af', 'arrow'],
    body: ['const ${1:name} = (${2:params}) => {', '  $0', '};'],
    description: 'Arrow function',
  },
  'Async Function': {
    prefix: ['asyncfn', 'async-function'],
    body: ['async function ${1:name}(${2:params}): Promise<${3:void}> {', '  $0', '}'],
    description: 'Async function with return type',
  },
  'Try-Catch': {
    prefix: ['trycatch', 'try'],
    body: ['try {', '  $0', '} catch (error) {', '  console.error(error);', '}'],
    description: 'Try-catch block',
  },
  'Express Route': {
    prefix: ['exroute', 'express-route'],
    body: [
      "app.${1|get,post,put,delete|}('${2:/path}', async (req, res) => {",
      '  $0',
      '});',
    ],
    description: 'Express route handler',
  },
  'Interface': {
    prefix: ['intf', 'interface'],
    body: ['export interface ${1:Name} {', '  ${2:key}: ${3:type};', '  $0', '}'],
    description: 'TypeScript interface',
  },
};

const PYTHON_SNIPPETS = {
  'Class': {
    prefix: ['cls', 'class'],
    body: [
      'class ${1:ClassName}:',
      '    def __init__(self${2:, args}) -> None:',
      '        $0',
    ],
    description: 'Python class with __init__',
  },
  'Dataclass': {
    prefix: ['dc', 'dataclass'],
    body: [
      'from dataclasses import dataclass',
      '',
      '',
      '@dataclass',
      'class ${1:ClassName}:',
      '    ${2:name}: ${3:str}',
      '    $0',
    ],
    description: 'Python dataclass',
  },
  'Async Function': {
    prefix: ['asyncdef', 'async'],
    body: ['async def ${1:name}(${2:args}) -> ${3:None}:', '    $0'],
    description: 'Async function definition',
  },
  'Flask Route': {
    prefix: ['flaskroute', 'flask-route'],
    body: [
      "@app.route('${1:/path}', methods=['${2|GET,POST,PUT,DELETE|}'])",
      'def ${3:handler}():',
      '    $0',
    ],
    description: 'Flask route handler',
  },
  'FastAPI Endpoint': {
    prefix: ['fapiget', 'fastapi-endpoint'],
    body: [
      "@app.${1|get,post,put,delete|}('${2:/path}')",
      'async def ${3:handler}(${4:}):',
      '    $0',
    ],
    description: 'FastAPI endpoint',
  },
  'Pytest Function': {
    prefix: ['pytest', 'test'],
    body: ['def test_${1:name}():', '    $0', '    assert True'],
    description: 'Pytest test function',
  },
};

const GO_SNIPPETS = {
  'Main': {
    prefix: ['main', 'go-main'],
    body: ['package main', '', 'import "fmt"', '', 'func main() {', '\tfmt.Println("${1:Hello}")', '\t$0', '}'],
    description: 'Go main package',
  },
  'Struct with Methods': {
    prefix: ['struct', 'go-struct'],
    body: [
      'type ${1:Name} struct {',
      '\t${2:Field} ${3:string}',
      '}',
      '',
      'func (${4:n} *${1:Name}) ${5:Method}() ${6:error} {',
      '\t$0',
      '}',
    ],
    description: 'Go struct with method',
  },
  'HTTP Handler': {
    prefix: ['handler', 'http-handler'],
    body: [
      'func ${1:handler}(w http.ResponseWriter, r *http.Request) {',
      '\t$0',
      '}',
    ],
    description: 'Go HTTP handler function',
  },
  'Error Handling': {
    prefix: ['iferr', 'if-err'],
    body: ['if err != nil {', '\treturn ${1:err}', '}'],
    description: 'Go error check pattern',
  },
};

const RUST_SNIPPETS = {
  'Struct with Impl': {
    prefix: ['structimpl', 'struct-impl'],
    body: [
      'struct ${1:Name} {',
      '    ${2:field}: ${3:String},',
      '}',
      '',
      'impl ${1:Name} {',
      '    fn new(${2:field}: ${3:String}) -> Self {',
      '        Self { ${2:field} }',
      '    }',
      '    $0',
      '}',
    ],
    description: 'Rust struct with impl block',
  },
  'Enum with Match': {
    prefix: ['enummatch', 'enum-match'],
    body: [
      'enum ${1:Name} {',
      '    ${2:Variant1},',
      '    ${3:Variant2},',
      '}',
      '',
      'match ${4:value} {',
      '    ${1:Name}::${2:Variant1} => $0,',
      '    ${1:Name}::${3:Variant2} => todo!(),',
      '}',
    ],
    description: 'Rust enum with match expression',
  },
  'Main': {
    prefix: ['main', 'rust-main'],
    body: ['fn main() {', '    $0', '}'],
    description: 'Rust main function',
  },
  'Result Handling': {
    prefix: ['result', 'fn-result'],
    body: [
      'fn ${1:name}(${2:args}) -> Result<${3:()}, ${4:Box<dyn std::error::Error>}> {',
      '    $0',
      '    Ok(${5:()})',
      '}',
    ],
    description: 'Rust function returning Result',
  },
};

@injectable()
export class AvaSnippetContribution implements FrontendApplicationContribution {

  @inject(MonacoSnippetSuggestProvider)
  protected readonly snippetProvider: MonacoSnippetSuggestProvider;

  async onStart(): Promise<void> {
    const source = 'Ava | Supernova';

    this.snippetProvider.fromJSON(TS_SNIPPETS, { language: 'typescript', source });
    this.snippetProvider.fromJSON(TS_SNIPPETS, { language: 'typescriptreact', source });
    this.snippetProvider.fromJSON(TS_SNIPPETS, { language: 'javascript', source });
    this.snippetProvider.fromJSON(TS_SNIPPETS, { language: 'javascriptreact', source });
    this.snippetProvider.fromJSON(PYTHON_SNIPPETS, { language: 'python', source });
    this.snippetProvider.fromJSON(GO_SNIPPETS, { language: 'go', source });
    this.snippetProvider.fromJSON(RUST_SNIPPETS, { language: 'rust', source });
  }
}
