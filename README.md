# Archivage SONAL — GED & Circulation du courrier

Application React (Vite + TypeScript + Tailwind + Lucide) connectée à Supabase.

## Démarrage

```bash
npm install
npm run dev
```

Variables d’environnement (fichier `.env`) :

```
VITE_SUPABASE_URL=https://kfpkjllfaiqkvsjoaiqv.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_publishable
```

## Structure

- `src/modules/ged` — UI GED, hook `useDocumentWorkflow`, règles CC
- `src/services/circulationService.ts` — accès Supabase (archives, circulations, storage)
- `src/types/ged.ts` — types métier
- `supabase/migrations/001_ged_schema.sql` — schéma complet + RLS + Storage

## Parcours documentaires

| Code | Description | CC automatiques |
|------|-------------|-----------------|
| P1 | Inter-directions via secrétariats | — |
| P2 | Intra-direction même service | Chef de service |
| P3 | Inter-directions via cadres | Directeur émetteur |
| P4 | Intra-direction services différents | 2 chefs + directeur |
| BROADCAST | Diffusion DA → tous secrétariats | Tous secrétariats |

## Base de données

Projet Supabase principal : `kfpkjllfaiqkvsjoaiqv` (centralisation SONAL).

- Tables GED : `tb_archives`, `tb_circulations`, `tb_profiles`, …
- Agents RH : vue `v_ged_agents` + RPC `ged_list_agents` (depuis `TbPersonnels`)
- Directions / services : seedés depuis `TbPersonnels.Direct` / `Service` (7 directions, 24 services, ~383 agents actifs)
- Le tableau Activité documentaire dépend du RPC `ged_profile_activity_stats`, créé par `supabase/migrations/026_ged_profile_communications.sql`. Appliquer les migrations au projet configuré dans `.env` si ce RPC est absent.
