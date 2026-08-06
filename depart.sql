Act en tant que Lead Architecte Software & Fullstack Senior expert en React, TypeScript, Tailwind CSS et Supabase (PostgreSQL).

Nous entamons la conception d'un **Système d'Archivage Numérique et de Circulation du Courrier / GED** pour la SONAL SA. 

L'objectif est d'automatiser et de sécuriser la circulation documentaire inter et intra-directions tout en assurant l'archivage légal et pérenne des pièces.

---

### 1. Script SQL de Départ & Modélisation Postgres (Supabase)

Voici la structure existante générée sous WINDEV qu'il faut consolider :

```sql
-- Tables d'origine à adapter
CREATE TABLE "TbArchives" (
    "IdArchive_Docs" SERIAL8 PRIMARY KEY,
    "IdArchive" VARCHAR(10),
    "Num_Folio" VARCHAR(4),
    "Date_Doc" DATE,
    "Emetteur" VARCHAR(40),
    "Recepteur" VARCHAR(40),
    "Reference" VARCHAR(30),
    "Concerne" VARCHAR(255),
    "Emplacement" VARCHAR(80),
    "Direction_Emet" VARCHAR(40),
    "Direction_Recept" VARCHAR(40),
    "Service_Emet" VARCHAR(40),
    "Service_Recept" VARCHAR(40),
    "Agent_Archive" VARCHAR(40),
    "Activite" BOOL DEFAULT true,
    "Image_Doc" BYTEA,
    "Chemin" VARCHAR(200),
    "Type" VARCHAR(5) DEFAULT 'Pdf',
    "Nom_Doc_Phys" VARCHAR(70)
);

CREATE TABLE "TbArchives_Cli" (
    "IdArchive" VARCHAR(10),
    "Num_Folio" VARCHAR(4),
    "Date_Doc" DATE,
    "Emetteur" VARCHAR(40),
    "Recepteur" VARCHAR(40),
    "Reference" VARCHAR(30),
    "Concerne" VARCHAR(255),
    "Emplacement" VARCHAR(80),
    "Direction_Emet" VARCHAR(40),
    "Direction_Recept" VARCHAR(40),
    "Service_Emet" VARCHAR(40),
    "Service_Recept" VARCHAR(40),
    "Agent_Archive" VARCHAR(40) DEFAULT '-',
    "Activite" BOOL DEFAULT true,
    "Image_Doc" BYTEA,
    "Chemin" VARCHAR(200),
    "Type" VARCHAR(5) DEFAULT 'Pdf',
    "Nom_Doc_Phys" VARCHAR(70)
);

CREATE TABLE "TbCorrespondants" (
    "Indice" VARCHAR(1),
    "Correspondant" VARCHAR(40)
);