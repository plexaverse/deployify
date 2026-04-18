2. Notice `.agent/RULES.md` has outdated typography standards (it mentions `text-[10px]`, `text-xs`, `text-sm`, `text-xl` etc., but Memory and `.agent/ui.md` say we are at `text-[8px]`, `text-[10px]`, `text-[8px] md:text-[10px]`). I should update `.agent/RULES.md` to reflect the latest standard from Session 203.
3. Add a log entry to `.agent/IMPROVEMENTS.md` summarizing the recent fix in `ShieldSecurity.tsx` (fixing lint issue for `loading` state) and noting that `.agent/RULES.md` was synced with the final state of `.agent/ui.md` (Session 203 typography standards).
4. Run Pre-commit checks (which are already passing, but good to run again before final submit).
5. Submit.
