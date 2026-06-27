import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import fc from 'fast-check';

// Feature: admin-ux-enhancement, Property 5: Public form rejects incomplete submissions with no side effects
//
// *For any* public-form input state in which at least one required field
// (customer name, phone, details, or proof) is missing or blank, submitting
// SHALL reject the submission, retain all entered values, surface an
// i18n-resolved validation message identifying the affected field, and produce
// no side effects (no storage upload and no `submit_remote_order` RPC call).
//
// Validates: Requirements 11.5

// i18n neutralised: `useT` returns a STABLE identity function (vi.hoisted) so
// the resolved message equals its key — an i18n-resolved, non-empty label that
// still distinguishes the affected field (proof vs. other required field).
const identityT = vi.hoisted(() => (key) => key);
vi.mock('./i18n', () => ({
  useT: () => identityT,
}));

// Spy Supabase client: `storage.from().upload` and `rpc` are vi.fn() so we can
// assert they are NEVER called when a submission is rejected for incompleteness.
const sb = vi.hoisted(() => ({
  upload: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('./services/supabase', () => ({
  supabase: {
    storage: { from: (...args) => sb.from(...args) },
    rpc: (...args) => sb.rpc(...args),
  },
}));

import FormulaireCommande from './pages/FormulaireCommande';
import { encodeOrderLink, generateOrderToken } from './utils/orderToken';

// A well-formed `:lien` built from the pure orderToken helpers, so the public
// form renders (valid link route) rather than the invalid-link refusal card.
const buildValidLink = () =>
  encodeOrderLink({ agencyId: 'agency-123', token: generateOrderToken() });

// Renders FormulaireCommande at a VALID order-link route `/commande/:lien`.
const renderForm = () => {
  const lien = buildValidLink();
  return render(
    <MemoryRouter initialEntries={[`/commande/${lien}`]}>
      <Routes>
        <Route path="/commande/:lien" element={<FormulaireCommande />} />
      </Routes>
    </MemoryRouter>
  );
};

const setField = (id, value) => {
  fireEvent.change(document.getElementById(id), { target: { value } });
};

const attachProof = () => {
  const file = new File(['preuve'], 'recu.png', { type: 'image/png' });
  fireEvent.change(document.getElementById('order-proof'), {
    target: { files: [file] },
  });
};

beforeEach(() => {
  sb.upload.mockReset();
  sb.rpc.mockReset();
  sb.from.mockReset();
  sb.upload.mockResolvedValue({ error: null });
  sb.rpc.mockResolvedValue({ error: null });
  sb.from.mockReturnValue({ upload: (...args) => sb.upload(...args) });
});

afterEach(() => {
  cleanup();
});

// A text field is either filled with a guaranteed non-blank value (present) or
// blank/whitespace-only (absent per `isFieldPresent`).
//
// Values are kept free of CR/LF: single-line `<input>` elements strip line
// breaks via HTML value sanitization (mirrored by jsdom), which would otherwise
// make the retained-value assertion compare against a sanitized string rather
// than testing the component's own state retention.
const noLineBreaks = (s) => s.replace(/[\r\n]/g, '');
const nonBlank = fc.string().map((s) => `a${noLineBreaks(s)}`); // `a` survives trim() => present
const blank = fc.constantFrom('', ' ', '   ', '\t', '  \t ');
const textField = fc.oneof(
  nonBlank.map((value) => ({ value, present: true })),
  blank.map((value) => ({ value, present: false }))
);

describe('Property 5: public form rejects incomplete submissions with no side effects', () => {
  it('rejects every input state missing >=1 required field, retains values, shows an i18n message, and triggers no upload/RPC', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: textField,
          phone: textField,
          details: textField,
          proofPresent: fc.boolean(),
        }),
        (state) => {
          // Constrain the input space to INCOMPLETE submissions: at least one
          // required field is missing/blank.
          fc.pre(
            !(
              state.name.present &&
              state.phone.present &&
              state.details.present &&
              state.proofPresent
            )
          );

          sb.upload.mockClear();
          sb.rpc.mockClear();
          sb.from.mockClear();

          try {
            renderForm();

            // Fill text inputs with the generated values (blank ones included).
            setField('order-customer-name', state.name.value);
            setField('order-customer-phone', state.phone.value);
            setField('order-details', state.details.value);
            if (state.proofPresent) {
              attachProof();
            }

            fireEvent.submit(document.querySelector('form'));

            // Expected first missing field follows REQUIRED_ORDER_FIELDS order.
            const expectedMessage = !state.name.present
              ? 'order_form.error_missing_field'
              : !state.phone.present
              ? 'order_form.error_missing_field'
              : !state.details.present
              ? 'order_form.error_missing_field'
              : 'order_form.error_proof_required';

            // Rejection: success state / `done` NOT reached (no success message,
            // form still present).
            expect(screen.queryByText('order_form.success')).toBeNull();
            expect(document.querySelector('form')).not.toBeNull();

            // An i18n-resolved, non-empty validation message identifying the
            // affected field is shown.
            const messageEl = screen.getByText(expectedMessage);
            expect(messageEl).toBeTruthy();
            expect(messageEl.textContent.trim().length).toBeGreaterThan(0);

            // Entered values are retained.
            expect(document.getElementById('order-customer-name').value).toBe(
              state.name.value
            );
            expect(document.getElementById('order-customer-phone').value).toBe(
              state.phone.value
            );
            expect(document.getElementById('order-details').value).toBe(
              state.details.value
            );

            // NO side effects: neither the storage upload nor the
            // submit_remote_order RPC was ever called.
            expect(sb.upload).not.toHaveBeenCalled();
            expect(sb.rpc).not.toHaveBeenCalled();
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
