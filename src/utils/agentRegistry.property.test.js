import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  AGENT_TYPES,
  CRITICAL_ACTION_KINDS,
  createAgentRegistry,
  registerAgent,
  isCriticalAction,
  canExecuteProposal,
} from './agentRegistry';

// --- Générateurs partagés -------------------------------------------------

// Les six types d'Agent_IA anticipés du Registre_Agents (Req 15.2).
const EXPECTED_AGENT_TYPES = [
  'forex',
  'comptabilite',
  'service_client',
  'whatsapp',
  'analyse_financiere',
  'marketing',
];

// Un genre d'action quelconque : critique (dans l'ensemble fermé) ou arbitraire
// (action non critique, casse différente, libellé inconnu, chaîne vide) afin de
// couvrir tout l'espace d'entrée.
const anyActionKind = fc.oneof(
  fc.constantFrom(...CRITICAL_ACTION_KINDS),
  fc.constantFrom(
    'operation.lire',
    'tableau_de_bord.consulter',
    'OPERATION.CREER', // casse différente — hors ensemble fermé
    'inconnu',
    ''
  ),
  fc.string({ maxLength: 24 })
);

// Une Permission quelconque (connue ou arbitraire), traitée ensemblistement.
const anyPermission = fc.constantFrom(
  'operations.creer',
  'operations.modifier',
  'services.vendre',
  'solde.ajuster',
  'whatsapp.envoyer',
  'perm.inconnue',
  ''
);

// Un identifiant de confirmateur : présent (chaîne non vide), vide/espaces
// (non identifié), ou absent (null/undefined) — toute l'étendue du contrat.
const anyConfirmedBy = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
  fc.constantFrom('', '   ', '\t'),
  fc.constant(null),
  fc.constant(undefined)
);

// Indique si une valeur identifie effectivement un confirmateur (Req 15.4).
const hasConfirmer = (confirmedBy) =>
  typeof confirmedBy === 'string'
    ? confirmedBy.trim().length > 0
    : confirmedBy != null;

// Un type d'agent arbitraire pour l'extensibilité du registre (Req 15.1).
const anyAgentType = fc.oneof(
  fc.constantFrom(...EXPECTED_AGENT_TYPES, 'risque', 'recouvrement', 'kyc'),
  fc.string({ maxLength: 16 })
);

// --- Property 30 ----------------------------------------------------------

describe('agentRegistry — Property 30 : validation humaine préalable à toute Action_Critique', () => {
  // Feature: agency-operations-expansion, Property 30: Validation humaine préalable à toute Action_Critique (Human Confirmation First)
  // Pour tout type d'Agent_IA et toute Action_Critique proposée (dont une Commande_Distante à
  // enregistrer définitivement), canExecuteProposal retourne vrai si et seulement si une Confirmation
  // explicite a été donnée par un Utilisateur disposant de la Permission requise ; en l'absence de
  // Confirmation habilitée, aucun effet persistant ou externe n'est exécuté.
  // Validates: Requirements 14.7, 15.3, 15.4, 15.6

  it('canExecuteProposal === (action non critique) ∨ (confirmateur identifié ∧ permission requise satisfaite)', () => {
    fc.assert(
      fc.property(
        anyActionKind,
        fc.option(anyPermission, { nil: undefined }),
        anyConfirmedBy,
        fc.array(anyPermission, { maxLength: 6 }),
        (kind, requiredPermission, confirmedBy, confirmerPermissions) => {
          const action =
            requiredPermission === undefined
              ? { kind }
              : { kind, requiredPermission };

          const critical = isCriticalAction(kind);
          const confirmerPresent = hasConfirmer(confirmedBy);
          const permissionOk =
            requiredPermission == null ||
            confirmerPermissions.includes(requiredPermission);

          const expected = !critical || (confirmerPresent && permissionOk);

          expect(
            canExecuteProposal({ action, confirmedBy, confirmerPermissions })
          ).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toute Action_Critique sans Confirmation identifiée est refusée (aucun effet exécuté)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CRITICAL_ACTION_KINDS),
        fc.option(anyPermission, { nil: undefined }),
        fc.constantFrom('', '   ', '\t'),
        fc.array(anyPermission, { maxLength: 6 }),
        (kind, requiredPermission, blankConfirmer, confirmerPermissions) => {
          const action =
            requiredPermission === undefined
              ? { kind }
              : { kind, requiredPermission };
          expect(
            canExecuteProposal({
              action,
              confirmedBy: blankConfirmer,
              confirmerPermissions,
            })
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
    // Confirmateur absent (null/undefined) : également refusé.
    fc.assert(
      fc.property(fc.constantFrom(...CRITICAL_ACTION_KINDS), (kind) => {
        expect(canExecuteProposal({ action: { kind } })).toBe(false);
        expect(
          canExecuteProposal({ action: { kind }, confirmedBy: null })
        ).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('toute Action_Critique exigeant une Permission est refusée si le confirmateur ne la détient pas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CRITICAL_ACTION_KINDS),
        anyPermission.filter((p) => p.length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.array(anyPermission, { maxLength: 6 }),
        (kind, requiredPermission, confirmedBy, otherPermissions) => {
          // On garantit que la permission requise est absente de l'ensemble du confirmateur.
          const permissions = otherPermissions.filter(
            (p) => p !== requiredPermission
          );
          expect(
            canExecuteProposal({
              action: { kind, requiredPermission },
              confirmedBy,
              confirmerPermissions: permissions,
            })
          ).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('une Action_Critique confirmée par un Utilisateur disposant de la Permission requise est exécutable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CRITICAL_ACTION_KINDS),
        anyPermission.filter((p) => p.length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.array(anyPermission, { maxLength: 5 }),
        (kind, requiredPermission, confirmedBy, extraPermissions) => {
          expect(
            canExecuteProposal({
              action: { kind, requiredPermission },
              confirmedBy,
              confirmerPermissions: [...extraPermissions, requiredPermission],
            })
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toute action NON critique est exécutable sans Confirmation, quel que soit le confirmateur', () => {
    const nonCriticalKind = fc
      .oneof(
        fc.constantFrom('operation.lire', 'tableau_de_bord.consulter', 'inconnu', ''),
        fc.string({ maxLength: 20 })
      )
      .filter((k) => !CRITICAL_ACTION_KINDS.includes(k));

    fc.assert(
      fc.property(nonCriticalKind, anyConfirmedBy, (kind, confirmedBy) => {
        expect(canExecuteProposal({ action: { kind }, confirmedBy })).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('un appel sans argument ou sans action n\'exécute aucune Action_Critique (action absente non critique)', () => {
    // Une action absente n'est pas une Action_Critique : exécutable (rien de critique proposé).
    expect(canExecuteProposal()).toBe(true);
    expect(canExecuteProposal({})).toBe(true);
  });
});

// --- Property 31 ----------------------------------------------------------

describe('agentRegistry — Property 31 : registre d\'agents extensible et journalisation des confirmations', () => {
  // Feature: agency-operations-expansion, Property 31: Registre d'agents extensible et journalisation des confirmations
  // Pour tout registre et tout descripteur d'agent, registerAgent ajoute le type sans retirer les
  // types existants. La journalisation des confirmations (identité + horodatage) relève de la table
  // critical_action_log (RLS / effet de bord) et est vérifiée hors logique pure ; cette propriété
  // couvre la partie testable en logique pure : l'extensibilité non destructive du Registre_Agents.
  // Validates: Requirements 15.1, 15.5

  it('le Registre_Agents est initialisé avec exactement les six types anticipés (Req 15.2)', () => {
    expect([...AGENT_TYPES].sort()).toEqual([...EXPECTED_AGENT_TYPES].sort());
    expect(AGENT_TYPES).toHaveLength(EXPECTED_AGENT_TYPES.length);

    const registry = createAgentRegistry();
    const types = registry.agents.map((a) => a.type);
    expect([...types].sort()).toEqual([...EXPECTED_AGENT_TYPES].sort());
    // Chaque appel produit un nouvel objet (aucun état partagé).
    expect(createAgentRegistry()).not.toBe(registry);
  });

  it('registerAgent ajoute un nouveau type SANS retirer aucun type existant (extensibilité)', () => {
    fc.assert(
      fc.property(anyAgentType, fc.boolean(), (type, isEnabled) => {
        const before = createAgentRegistry();
        const beforeTypes = before.agents.map((a) => a.type);

        const after = registerAgent(before, { type, isEnabled });
        const afterTypes = after.agents.map((a) => a.type);

        // Tous les types présents avant le sont encore après (aucun retrait).
        for (const t of beforeTypes) {
          expect(afterTypes).toContain(t);
        }
        // Le type fourni (non vide) est présent après l'ajout.
        if (typeof type === 'string' && type.trim().length > 0) {
          expect(afterTypes).toContain(type);
        }
        // Le registre d'entrée n'est jamais muté (fonction pure).
        expect(before.agents.map((a) => a.type)).toEqual(beforeTypes);
      }),
      { numRuns: 100 }
    );
  });

  it('registerAgent est idempotent et sans doublon pour un type déjà recensé', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_AGENT_TYPES),
        fc.boolean(),
        (existingType, isEnabled) => {
          const registry = createAgentRegistry();
          const after = registerAgent(registry, { type: existingType, isEnabled });
          const occurrences = after.agents.filter(
            (a) => a.type === existingType
          ).length;
          expect(occurrences).toBe(1);
          // L'ensemble des types reste inchangé (aucun ajout d'un type déjà présent).
          expect([...after.agents.map((a) => a.type)].sort()).toEqual(
            [...registry.agents.map((a) => a.type)].sort()
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ajouts successifs : chaque nouveau type distinct est cumulé, l\'ensemble ne fait que croître', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
          { maxLength: 6 }
        ),
        (newTypes) => {
          let registry = createAgentRegistry();
          const expected = new Set(registry.agents.map((a) => a.type));

          for (const type of newTypes) {
            const previousCount = registry.agents.length;
            registry = registerAgent(registry, { type });
            expected.add(type);

            // L'ensemble des types correspond exactement à l'union cumulée.
            expect(new Set(registry.agents.map((a) => a.type))).toEqual(expected);
            // Le nombre d'entrées ne décroît jamais.
            expect(registry.agents.length).toBeGreaterThanOrEqual(previousCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('un descripteur invalide (type absent, vide ou non chaîne) laisse l\'ensemble des types inchangé', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.constant({}),
          fc.record({ type: fc.constantFrom('', '   ', '\t') }),
          fc.record({ type: fc.integer() }),
          fc.record({ type: fc.constant(null) })
        ),
        (invalidDescriptor) => {
          const registry = createAgentRegistry();
          const after = registerAgent(registry, invalidDescriptor);
          expect([...after.agents.map((a) => a.type)].sort()).toEqual(
            [...registry.agents.map((a) => a.type)].sort()
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('registerAgent tolère un registre absent ou malformé en repartant d\'un registre vide', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        (type) => {
          for (const broken of [undefined, null, {}, { agents: 'x' }, { agents: null }]) {
            const after = registerAgent(broken, { type });
            expect(Array.isArray(after.agents)).toBe(true);
            expect(after.agents.map((a) => a.type)).toContain(type);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
