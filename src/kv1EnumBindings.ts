import type { Kv1ValueMode } from "./kv1Schema";

export interface Kv1EnumBinding {
    enumName: string;
    mode: Kv1ValueMode;
}

export const KV1_ENUM_BINDINGS: Record<string, Kv1EnumBinding> = {
    AbilityBehavior: {
        enumName: "AbilityBehavior",
        mode: "flags"
    },

    AbilityUnitTargetTeam: {
        enumName: "UnitTargetTeam",
        mode: "flags"
    },

    AbilityUnitTargetType: {
        enumName: "UnitTargetType",
        mode: "flags"
    },

    AbilityUnitTargetFlags: {
        enumName: "UnitTargetFlags",
        mode: "flags"
    },

    AbilityUnitDamageType: {
        enumName: "DamageType",
        mode: "single"
    },

    AttackCapabilities: {
        enumName: "UnitAttackCapability",
        mode: "single"
	},

	MovementCapabilities: 
	{
		enumName: "UnitMoveCapability",
		mode: "single"
	},
	
	SpellImmunityType: {
		enumName: "SpellImmunityType",
		mode: "single"
	},

	SpellDispellableType:
	{
		enumName: "SpellDispellableType",
		mode: "single"
	},

	TeamName:
	{
		enumName: "Team",
		mode: "single"
	},

	BoundsHullName:
	{
		enumName: "HullSize",
		mode: "single"
	}
};
