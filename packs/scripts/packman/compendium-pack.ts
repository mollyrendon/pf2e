import * as fs from "fs";
import * as path from "path";
import { isObject, sluggify } from "@util";
import { ItemSourcePF2e } from "@item/data";
import { isPhysicalData } from "@item/data/helpers";
import { MigrationRunnerBase } from "@module/migration/runner/base";
import { ActorSourcePF2e } from "@actor/data";
import { RuleElementSource } from "@module/rules";

export interface PackMetadata {
    system: string;
    name: string;
    path: string;
    type: string;
}

export const PackError = (message: string) => {
    console.error(`Error: ${message}`);
    process.exit(1);
};

type CompendiumSource = CompendiumDocument["data"]["_source"];
export function isActorSource(docSource: CompendiumSource): docSource is ActorSourcePF2e {
    return (
        "effects" in docSource &&
        Array.isArray(docSource.effects) &&
        "items" in docSource &&
        Array.isArray(docSource.items)
    );
}

export function isItemSource(docSource: CompendiumSource): docSource is ItemSourcePF2e {
    return "effects" in docSource && Array.isArray(docSource.effects) && "description" in docSource.data;
}

export class CompendiumPack {
    name: string;
    packDir: string;
    documentType: string;
    systemId: string;
    data: CompendiumSource[];

    static outDir = path.resolve(process.cwd(), "static/packs");
    private static namesToIds = new Map<string, Map<string, string>>();
    private static packsMetadata = JSON.parse(fs.readFileSync("system.json", "utf-8")).packs as PackMetadata[];
    private static worldItemLinkPattern = new RegExp(
        /@(?:Item|JournalEntry|Actor)\[[^\]]+\]|@Compendium\[world\.[^\]]+\]/
    );

    constructor(packDir: string, parsedData: unknown[]) {
        const metadata = CompendiumPack.packsMetadata.find(
            (pack) => path.basename(pack.path) === path.basename(packDir)
        );
        if (metadata === undefined) {
            throw PackError(`Compendium at ${packDir} has no metadata in the local system.json file.`);
        }
        this.systemId = metadata.system;
        this.name = metadata.name;
        this.documentType = metadata.type;

        if (!this.isPackData(parsedData)) {
            throw PackError(`Data supplied for ${this.name} does not resemble Foundry document source data.`);
        }

        this.packDir = packDir;

        CompendiumPack.namesToIds.set(this.name, new Map());
        const packMap = CompendiumPack.namesToIds.get(this.name);
        if (!packMap) {
            throw PackError(`Compendium ${this.name} (${packDir}) was not found.`);
        }

        parsedData.sort((a, b) => {
            if (a._id === b._id) {
                throw PackError(`_id collision in ${this.name}: ${a._id}`);
            }
            return a._id > b._id ? 1 : -1;
        });

        this.data = parsedData;

        for (const docSource of this.data) {
            // Populate CompendiumPack.namesToIds for later conversion of compendium links
            packMap.set(docSource.name, docSource._id);

            // Check img paths
            if ("img" in docSource && typeof docSource.img === "string") {
                const imgPaths: string[] = [docSource.img ?? ""].concat(
                    isActorSource(docSource) ? docSource.items.map((itemData) => itemData.img ?? "") : []
                );
                const documentName = docSource.name;
                for (const imgPath of imgPaths) {
                    if (imgPath.startsWith("data:image")) {
                        const imgData = imgPath.slice(0, 64);
                        const msg = `${documentName} (${this.name}) has base64-encoded image data: ${imgData}...`;
                        throw PackError(msg);
                    }

                    const repoImgPath = path.resolve(
                        process.cwd(),
                        "static",
                        decodeURIComponent(imgPath).replace("systems/pf2e/", "")
                    );
                    if (!imgPath.match(/^\/?icons\/svg/) && !fs.existsSync(repoImgPath)) {
                        throw PackError(`${documentName} (${this.name}) has a broken image link: ${imgPath}`);
                    }
                    if (!(imgPath === "" || imgPath.match(/\.(?:svg|webp)$/))) {
                        throw PackError(`${documentName} (${this.name}) references a non-WEBP/SVG image: ${imgPath}`);
                    }
                }
            }
            if ("type" in docSource && docSource.type === "script") {
                docSource.permission ??= { default: 1 };
            }
        }
    }

    static loadJSON(dirPath: string): CompendiumPack {
        if (!dirPath.replace(/\/$/, "").endsWith(".db")) {
            const dirName = path.basename(dirPath);
            throw PackError(`JSON directory (${dirName}) does not end in ".db"`);
        }

        const filenames = fs.readdirSync(dirPath);
        const filePaths = filenames.map((filename) => path.resolve(dirPath, filename));
        const parsedData = filePaths.map((filePath) => {
            const jsonString = fs.readFileSync(filePath, "utf-8");
            const packSource: CompendiumSource = (() => {
                try {
                    return JSON.parse(jsonString);
                } catch (error) {
                    if (error instanceof Error) {
                        throw PackError(`File ${filePath} could not be parsed: ${error.message}`);
                    }
                }
            })();

            const documentName = packSource?.name;
            if (documentName === undefined) {
                throw PackError(`Document contained in ${filePath} has no name.`);
            }

            const filenameForm = sluggify(documentName).concat(".json");
            if (path.basename(filePath) !== filenameForm) {
                throw PackError(`Filename at ${filePath} does not reflect document name (should be ${filenameForm}).`);
            }

            return packSource;
        });

        const dbFilename = path.basename(dirPath);
        return new CompendiumPack(dbFilename, parsedData);
    }

    private finalize(docSource: CompendiumSource) {
        // Replace all compendium entities linked by name to links by ID
        const stringified = JSON.stringify(docSource);
        const worldItemLink = CompendiumPack.worldItemLinkPattern.exec(stringified);
        if (worldItemLink !== null) {
            throw PackError(`${docSource.name} (${this.name}) has a link to a world item: ${worldItemLink[0]}`);
        }

        docSource.flags.core = { sourceId: this.sourceIdOf(docSource._id) };
        if (isActorSource(docSource)) {
            docSource.data.schema = { version: MigrationRunnerBase.LATEST_SCHEMA_VERSION, lastMigration: null };
            for (const item of docSource.items) {
                item.data.schema = { version: MigrationRunnerBase.LATEST_SCHEMA_VERSION, lastMigration: null };
            }
        }
        if (isItemSource(docSource)) {
            docSource.data.slug = sluggify(docSource.name);
            docSource.data.schema = { version: MigrationRunnerBase.LATEST_SCHEMA_VERSION, lastMigration: null };

            if (isPhysicalData(docSource)) {
                docSource.data.equipped.value = false;
            }

            // Convert uuids with names in GrantItem REs to well-formedness
            if (isItemSource(docSource)) {
                const rules: Array<RuleElementSource & { uuid?: unknown }> = docSource.data.rules;
                for (const rule of rules) {
                    if (rule.key === "GrantItem" && typeof rule.uuid === "string" && !rule.uuid.startsWith("{")) {
                        const match = /(?<=^Compendium\.pf2e\.)([^.]+)\.(.+)$/.exec(rule.uuid);
                        const [, packId, docName] = match ?? [null, null, null];
                        const docId = CompendiumPack.namesToIds.get(packId ?? "")?.get(docName ?? "");
                        if (docName && docId) {
                            rule.uuid = rule.uuid.replace(docName, docId);
                        } else {
                            throw PackError(`Unable to resolve UUID: ${rule.uuid}`);
                        }
                    }
                }
            }
        }

        return JSON.stringify(docSource).replace(
            /@Compendium\[pf2e\.(?<packName>[^.]+)\.(?<documentName>[^\]]+)\]\{?/g,
            (match, packName: string, documentName: string) => {
                const namesToIds = CompendiumPack.namesToIds.get(packName);
                const link = match.replace(/\{$/, "");
                if (namesToIds === undefined) {
                    throw PackError(`${docSource.name} (${this.name}) has a bad pack reference: ${link}`);
                }
                if (!match.endsWith("{")) {
                    throw PackError(`${docSource.name} (${this.name}) has a link with no label: ${link}`);
                }

                const documentId: string | undefined = namesToIds.get(documentName);
                if (documentId === undefined) {
                    throw PackError(
                        `${docSource.name} (${this.name}) has broken link to ${documentName} (${packName}).`
                    );
                }

                return `@Compendium[pf2e.${packName}.${documentId}]{`;
            }
        );
    }

    private sourceIdOf(documentId: string) {
        return `Compendium.${this.systemId}.${this.name}.${documentId}`;
    }

    save(): number {
        fs.writeFileSync(
            path.resolve(CompendiumPack.outDir, this.packDir),
            this.data
                .map((datum) => this.finalize(datum))
                .join("\n")
                .concat("\n")
        );
        console.log(`Pack "${this.name}" with ${this.data.length} entries built successfully.`);

        return this.data.length;
    }

    private isDocumentSource(maybeDocSource: unknown): maybeDocSource is CompendiumSource {
        if (!isObject(maybeDocSource)) return false;
        const checks = Object.entries({
            name: (data: { name?: unknown }) => typeof data.name === "string",
            flags: (data: unknown) => typeof data === "object" && data !== null && "flags" in data,
            permission: (data: { permission?: { default: unknown } }) =>
                !data.permission ||
                (typeof data.permission === "object" &&
                    data.permission !== null &&
                    Object.keys(data.permission).length === 1 &&
                    Number.isInteger(data.permission.default)),
        });

        const failedChecks = checks
            .map(([key, check]) => (check(maybeDocSource) ? null : key))
            .filter((key) => key !== null);

        if (failedChecks.length > 0) {
            throw PackError(
                `Document source in (${this.name}) has invalid or missing keys: ${failedChecks.join(", ")}`
            );
        }

        return true;
    }

    private isPackData(packData: unknown[]): packData is CompendiumSource[] {
        return packData.every((maybeDocSource: unknown) => this.isDocumentSource(maybeDocSource));
    }
}
