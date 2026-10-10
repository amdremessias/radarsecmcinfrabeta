# Especificação Técnica: Automação de Mapeamento de Arquivos Sensíveis e Subdomínios (Radar Security)

Este documento descreve a especificação técnica e o código em Python para integrar **duas novas baterias de testes automatizados** ao scanner do **Radar Security**:
1. **Descoberta Passiva de Subdomínios** (via Log de Transparência de Certificados / `crt.sh`).
2. **Varredura de Arquivos Sensíveis e Configurações Expostas** (`.env`, `.git`, backups, dumps de BD).

---

## 1. Arquitetura do Componente (`radar_scanner.py`)

A automação foi estruturada de forma modular, com execução em paralelo (`ThreadPoolExecutor`), otimizada para responder em **menos de 3 segundos**, alinhada à proposta de valor da plataforma.

### Tecnologias e Dependências
* **Python 3.9+**
* `requests` / `urllib3` (requisições HTTP assíncronas/paralelas com timeout rígido)
* `concurrent.futures` (execução multi-thread rápida)

---

## 2. Código da Automação (Python)

```python
import requests
import json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import urllib3

# Desativa alertas de certificados SSL inválidos em verificações brutas
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class RadarSecurityScanner:
    def __init__(self, target_domain: str, timeout: int = 3):
        parsed = urlparse(target_domain if "://" in target_domain else f"http://{target_domain}")
        self.domain = parsed.netloc or parsed.path
        self.base_url = f"https://{self.domain}"
        self.timeout = timeout
        
        # Lista de dicionários/rotas de alto risco para verificação
        self.sensitive_paths = [
            {"path": "/.env", "type": "Credenciais / Configuração", "severity": "CRITICAL"},
            {"path": "/.git/HEAD", "type": "Repositório Git Exposto", "severity": "HIGH"},
            {"path": "/wp-config.php.bak", "type": "Backup do WordPress", "severity": "HIGH"},
            {"path": "/config.json", "type": "Arquivo de Configuração", "severity": "MEDIUM"},
            {"path": "/.vscode/settings.json", "type": "Configuração da IDE", "severity": "LOW"},
            {"path": "/docker-compose.yml", "type": "Infraestrutura como Código", "severity": "HIGH"},
            {"path": "/backup.sql", "type": "Dump de Banco de Dados", "severity": "CRITICAL"},
            {"path": "/phpinfo.php", "type": "Informações do Servidor", "severity": "MEDIUM"},
            {"path": "/robots.txt", "type": "Mapeamento de Rotas", "severity": "INFO"},
            {"path": "/sitemap.xml", "type": "Estrutura do Site", "severity": "INFO"}
        ]

    def scan_sensitive_file(self, item: dict):
        url = f"{self.base_url}{item['path']}"
        headers = {'User-Agent': 'RadarSecurityBot/1.0 (+https://radarsec.duckdns.org)'}
        
        try:
            response = requests.get(
                url, 
                headers=headers, 
                timeout=self.timeout, 
                allow_redirects=False, 
                verify=False
            )
            
            if response.status_code == 200:
                content_length = len(response.content)
                content_type = response.headers.get("Content-Type", "").lower()
                
                # Descarte de páginas 200 HTML falsas (custom 404)
                if content_length > 10 and "text/html" not in content_type:
                    return {
                        "path": item["path"],
                        "url": url,
                        "status": "EXPOSED",
                        "type": item["type"],
                        "severity": item["severity"],
                        "size_bytes": content_length
                    }
                elif item["path"] in ["/.git/HEAD", "/robots.txt", "/sitemap.xml"]:
                    return {
                        "path": item["path"],
                        "url": url,
                        "status": "EXPOSED",
                        "type": item["type"],
                        "severity": item["severity"],
                        "size_bytes": content_length
                    }
        except requests.RequestException:
            pass
            
        return None

    def run_sensitive_files_scan(self) -> list:
        results = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            outcomes = executor.map(self.scan_sensitive_file, self.sensitive_paths)
            for res in outcomes:
                if res:
                    results.append(res)
        return results

    def fetch_subdomains_passive(self) -> list:
        url = f"https://crt.sh/?q=%.{self.domain}&output=json"
        headers = {'User-Agent': 'RadarSecurityBot/1.0'}
        subdomains = set()

        try:
            res = requests.get(url, headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                for entry in data:
                    name_value = entry.get('name_value', '')
                    for sub in name_value.split('\n'):
                        sub = sub.strip().lower()
                        if sub.startswith('*.'):
                            sub = sub[2:]
                        if sub.endswith(self.domain) and sub != self.domain:
                            subdomains.add(sub)
        except Exception:
            pass

        return sorted(list(subdomains))

    def execute_full_scan(self) -> dict:
        exposed_files = self.run_sensitive_files_scan()
        subdomains = self.fetch_subdomains_passive()

        # Cálculo de penalidade para a nota final (Score 0-100)
        penalty = 0
        for f in exposed_files:
            if f["severity"] == "CRITICAL":
                penalty += 25
            elif f["severity"] == "HIGH":
                penalty += 15
            elif f["severity"] == "MEDIUM":
                penalty += 5

        return {
            "domain": self.domain,
            "metrics": {
                "subdomains_found_count": len(subdomains),
                "exposed_files_count": len(exposed_files),
                "calculated_penalty": penalty
            },
            "subdomains": subdomains,
            "exposed_files": exposed_files
        }

if __name__ == "__main__":
    scanner = RadarSecurityScanner(target_domain="radarsec.duckdns.org")
    report = scanner.execute_full_scan()
    print(json.dumps(report, indent=2, ensure_ascii=False))
```

---

## 3. Modelo do Payload JSON de Retorno

O backend do Radar Security consumirá este formato para enviar ao Front-end:

```json
{
  "domain": "radarsec.duckdns.org",
  "metrics": {
    "subdomains_found_count": 2,
    "exposed_files_count": 1,
    "calculated_penalty": 25
  },
  "subdomains": [
    "api.radarsec.duckdns.org",
    "dev.radarsec.duckdns.org"
  ],
  "exposed_files": [
    {
      "path": "/.env",
      "url": "https://radarsec.duckdns.org/.env",
      "status": "EXPOSED",
      "type": "Credenciais / Configuração",
      "severity": "CRITICAL",
      "size_bytes": 380
    }
  ]
}
```

---

## 4. Guia de Integração e Pontos de Atenção (Para o Programador)

1. **Instalação de Dependências:**
   Adicionar no `requirements.txt`:
   ```text
   requests>=2.28.0
   urllib3>=1.26.0
   ```

2. **Ajuste na Lógica do Score (0–100):**
   * Subtrair o `metrics.calculated_penalty` do valor base da nota do domínio.

3. **Renderização no Front-end (Next.js / React):**
   * **Módulo de Subdomínios:** Renderizar uma nova caixa de listagem "Subdomínios Ativos e Registrados".
   * **Módulo de Exposição de Arquivos:** Exibir uma lista de cards informativos mostrando o caminho exposto, tamanho e badge de severidade (`CRITICAL`, `HIGH`, `MEDIUM`).
