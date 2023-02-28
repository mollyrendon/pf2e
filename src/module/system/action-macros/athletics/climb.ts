import { ActionMacroHelpers, SkillActionOptions } from "..";

export function climb(options: SkillActionOptions) {
    const slug = options?.skill ?? "athletics";
    const rollOptions = ["action:climb"];
    const modifiers = options?.modifiers;
    ActionMacroHelpers.simpleRollActionCheck({
        actors: options.actors,
        actionGlyph: options.glyph ?? "A",
        title: "PF2E.Actions.Climb.Title",
        checkContext: (opts) => ActionMacroHelpers.defaultCheckContext(opts, { modifiers, rollOptions, slug }),
        traits: ["move"],
        event: options.event,
        callback: options.callback,
        difficultyClass: options.difficultyClass,
        extraNotes: (selector: string) => [
            ActionMacroHelpers.note(selector, "PF2E.Actions.Climb", "criticalSuccess"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.Climb", "success"),
            ActionMacroHelpers.note(selector, "PF2E.Actions.Climb", "criticalFailure"),
        ],
    });
}
