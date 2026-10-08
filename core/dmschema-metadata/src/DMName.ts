/*---------------------------------------------------------------------------------------------
* Copyright (c) Szewec Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { assert } from "@szewtwin/core-szewec";
import { DMSchemaError, DMSchemaStatus } from "./Exception";

const validDMNameRegex = /^[a-zA-Z_]\w*$/i;
const dmNameReplacerRegex = /__x([0-9a-fA-F]{4})__/g;
const leadingDigits = ["0000", "000", "00", "0", ""];

function isDigit(character: string): boolean {
  assert(1 === character.length);
  return character >= "0" && character <= "9";
}

function isValidAlphaNumericCharacter(c: string): boolean {
  assert(1 === c.length);
  return (((c >= "0" && c <= "9") || (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_"));
}

/** The name of an item in a [[Schema]], encoded to meet restrictions on the characters usable in such names.
 * An DMName meets the following criteria:
 *  - Contains at least one character.
 *  - Does not begin with a digit.
 *  - Consists entirely of characters in the ASCII ranges A-Z, a-z, and 0-9; and the underscore ("_") character.
 *
 * All characters not meeting the above criteria are encoded as "__x####__" where "####" is the UTF-16 character code.
 * Such names are often automatically generated from the item's display label, which is unrestricted in the characters it may contain.
 * @public
 */
export class DMName {
  private _name: string;

  /** Construct a new DMName from a valid DM name.
   * throws DMSchemaError if `name` does not meet the criteria for a valid DM name.
   */
  constructor(name: string) {
    if (!DMName.validate(name))
      throw new DMSchemaError(DMSchemaStatus.InvalidDMName);

    this._name = name;
  }

  /** Returns true if a string meets the criteria of a valid DM name. */
  public static validate(name: string): boolean {
    return validDMNameRegex.test(name);
  }

  /** The underlying name as a string. */
  public get name(): string {
    return this._name;
  }

  /** Create an DMName from an arbitrary string, encoding any special characters as "__x####__" where "####" is the UTF-16 character code.
   * @throws DMSchemaError if `input` is an empty string.
   */
  public static encode(input: string): DMName {
    if (0 === input.length)
      throw new DMSchemaError(DMSchemaStatus.InvalidDMName);

    if (DMName.validate(input)) {
      // It's already a valid DM name.
      return new DMName(input);
    }

    let output = "";

    function appendEncodedCharacter(index: number): void {
      const hex = input.charCodeAt(index).toString(16).toUpperCase();
      assert(hex.length > 0 && hex.length < 5);
      output += `__x${leadingDigits[hex.length]}${hex}__`;
    }

    // First character cannot be a digit.
    const firstCharIsDigit = isDigit(input[0]);
    if (firstCharIsDigit)
      appendEncodedCharacter(0);

    for (let i = firstCharIsDigit ? 1 : 0; i < input.length; i++) {
      const char = input[i];
      if (!isValidAlphaNumericCharacter(char))
        appendEncodedCharacter(i);
      else
        output += char;
    }

    return new DMName(output);
  }

  /** Decode this DMName, replacing encoded special characters with the characters they encode. */
  public decode(): string {
    return this.name.replace(dmNameReplacerRegex, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
}
