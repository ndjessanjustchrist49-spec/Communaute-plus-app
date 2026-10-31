# Communauté+ v0.2

Application web progressive (PWA) en français pour une communauté organisée en **Département 1, Département 2, Département 3 et Peuple**. Le prédicateur est enregistré sur chaque rencontre et prêche devant toute l'assemblée : ce n'est pas un département supplémentaire.

## Fonctions incluses
- Connexion et création de compte par e-mail/mot de passe via Supabase Auth.
- Création de la communauté par le premier compte (administrateur), puis rattachement des autres responsables par code.
- Rôles administrateur / responsable et politiques RLS dans PostgreSQL.
- Création des personnes, rencontres, présences et statistiques par groupe.
- Classification automatique d'une présence en Nouvelle, Ancienne ou Revenue (seuil de 28 jours, ajustable dans une prochaine version ; la catégorie peut être choisie manuellement).
- Cache local par communauté, opérations de création mises en file hors ligne, synchronisation à la reconnexion.
- Export CSV, interface responsive et cache PWA.

## Limites à connaître
- La synchronisation hors ligne est une **première implémentation** : elle met en file les nouvelles personnes, rencontres et présences. Les modifications/suppressions avancées, la résolution de conflits sophistiquée et la synchronisation en arrière-plan lorsque le navigateur est fermé ne sont pas encore implémentées.
- Les données locales et la file d'attente sont stockées dans le navigateur. Ne vide pas les données du navigateur avant que la file soit synchronisée.
- Le code d'accès est partagé entre responsables ; l'administrateur peut le renouveler. Partage-le uniquement avec les personnes autorisées.
- N'utilise pas de clé `service_role` dans le navigateur. Seule la clé publique `anon`/publishable doit être dans `.env`.
- Le build doit être testé localement après l'installation des dépendances. Ce projet n'a pas été déployé ni relié à un compte Supabase à ta place.

## Étape 1 — créer un projet Supabase gratuit
1. Va sur https://supabase.com et crée un compte, puis un nouveau projet.
2. Choisis un mot de passe fort pour la base de données et conserve-le en lieu sûr.
3. Dans le projet, ouvre **SQL Editor** puis **New query**.
4. Copie tout le contenu du fichier `supabase/schema.sql`, colle-le dans l'éditeur et clique **Run**.
5. Ouvre **Project Settings → API** (ou **Connect**) et copie le Project URL ainsi que la clé publique `anon`/`publishable`. Ne copie jamais la clé `service_role`.

## Étape 2 — configurer l'application
1. Installe Node.js LTS depuis https://nodejs.org sur ton ordinateur.
2. Décompresse l'archive `communaute_plus_v0_2.zip`.
3. Dans le dossier `communaute_plus`, copie `.env.example` et renomme la copie en `.env`.
4. Ouvre `.env` avec Bloc-notes et remplace les valeurs par celles de Supabase :

```env
VITE_SUPABASE_URL=https://ton-projet.supabase.co
VITE_SUPABASE_ANON_KEY=ta_cle_publique_anon
```

5. Ouvre le terminal dans ce dossier (dans l'Explorateur Windows, clique la barre d'adresse, tape `cmd`, puis Entrée).
6. Exécute :

```bash
npm install
npm run dev
```

7. Ouvre l'adresse affichée, généralement `http://localhost:5173`.

## Étape 3 — créer l'administrateur et ajouter les responsables
1. Le premier utilisateur crée un compte et se connecte.
2. Dans l'écran de bienvenue, il choisit **Créer la communauté**, saisit le nom de la communauté et son nom affiché. Il devient administrateur et reçoit un code d'accès.
3. Chaque responsable crée son propre compte sur la même application, puis saisit le code pour rejoindre la communauté.
4. Ne communique pas le code publiquement. Si nécessaire, l'administrateur peut le renouveler dans **Administration**.
5. Dans Supabase **Authentication → URL Configuration**, configure les URLs du site quand tu hébergeras l'application. Pour les tests locaux, autorise l'URL locale si nécessaire.

> Si Supabase demande une confirmation par e-mail, confirme l'adresse avant de te connecter. Pour un premier test, tu peux ajuster la confirmation e-mail dans les paramètres Auth du projet ; pour une utilisation réelle, garde une politique d'authentification appropriée.

## Étape 4 — utilisation hors ligne et installation sur téléphone
- Connecte-toi en ligne au moins une fois depuis chaque appareil pour charger les données et la session.
- L'application conserve les données chargées dans le navigateur. Si la connexion tombe, les nouvelles entrées sont mises en attente et envoyées lorsque la connexion revient.
- Quand le site est hébergé en HTTPS, ouvre-le dans Chrome sur Android et choisis **Installer l'application** ou **Ajouter à l'écran d'accueil**.
- Pour mettre en production, exécute `npm run build`, puis héberge le dossier `dist/` sur un service statique HTTPS. Configure aussi l'URL de redirection Auth de Supabase avec l'URL publique.

## Schéma de données
- `communities`: communauté et code d'accès.
- `profiles`: utilisateur, rôle et communauté.
- `people`: nom, téléphone facultatif et groupe (les quatre choix ci-dessus).
- `meetings`: date, titre, prédicateur et notes.
- `attendance`: présence, personne, rencontre et classification.

La base applique des règles de sécurité Row Level Security (RLS) afin qu'un utilisateur connecté ne puisse lire que les lignes de sa communauté. Les suppressions de personnes, rencontres et présences sont réservées à l'administrateur.
