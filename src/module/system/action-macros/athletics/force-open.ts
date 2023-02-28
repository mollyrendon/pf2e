import { ActionMacroHelpers, SkillActionOptions } from "..";

export function forceOpen(options: SkillActionOptions) {
    const slug = options?.skill ?? "athletics";
    const rollOptions = ["action:force-open"];
    const modifiers = options?.modifiers;
    ActionMacroHelpers.simpleRollActionCheck({
        actors: options.actors,
        actionGlyph: options.glyph ?? "A",
        title: "PF2E.Actions.ForceOpen.Title",
        checkContext: (opts) => ActionMacroHelpers.defaultCheckContext(opts, { modifiers, rollOptions, slug }),
        traits: ["attack"],
        event: options.event,
        callback: options.callback,
        difficultyClass: options.difficultyClass,
        extraNotes: (selector: string) => [
            ActionMacroHelpers.note(selector, "PF2E.Actions.ForceOpen", "criticalSuccess"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.ForceOpen", "success"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.ForceOpen", "criticalFailure"),
        ],
    });
}
