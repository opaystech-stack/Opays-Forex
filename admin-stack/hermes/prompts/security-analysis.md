# Spécification — Agent de Sécurité (analyse des logs)

`agents/security.js` analyse `audit_logs` (déterministe, sans IA) sur 24h et
remonte trois familles d'anomalies dans `security_alerts` :

| Règle | Critère | Sévérité |
|-------|---------|----------|
| `auth_failures` | ≥ 5 échecs d'authentification (même user/IP) | high |
| `ip_dispersion` | ≥ 4 IP distinctes pour un même utilisateur | medium |
| `sensitive_volume` | ≥ 20 actions sensibles (delete/permission/role) | medium |

Seuils ajustables dans le script. Prérequis : la table `audit_logs` doit être
alimentée par l'API (action, user_id, ip_address, created_at).

**Option IA (facultative)** : agréger les alertes du jour et demander à Gemini
une priorisation :

```
Voici les alertes de sécurité des dernières 24h (JSON). Classe-les par risque
réel décroissant et propose une action concrète par alerte, en français.
Ne fabrique aucune donnée absente du JSON.
```
