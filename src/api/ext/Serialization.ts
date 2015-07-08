/// <reference path='../definitions/VSS-Common.d.ts' />

/**
 * Metadata for deserializing an enum field on a contract/type
 */
export interface ContractEnumMetadata {
    enumValues?: { [name: string]: number; };
}

/**
 * Metadata for deserializing a particular field on a contract/type
 */
export interface ContractFieldMetadata {
    isArray?: boolean;
    isDate?: boolean;
    enumType?: ContractEnumMetadata;
    typeInfo?: ContractMetadata;

    isDictionary?: boolean;
    dictionaryKeyIsDate?: boolean;
    dictionaryValueIsDate?: boolean;
    dictionaryKeyEnumType?: ContractEnumMetadata;
    dictionaryValueEnumType?: ContractEnumMetadata;
    dictionaryValueTypeInfo?: ContractMetadata;
    dictionaryValueFieldInfo?: ContractFieldMetadata;
}

/**
 * Metadata required for deserializing a given type
 */
export interface ContractMetadata {
    fields?: { [fieldName: string]: ContractFieldMetadata; };
}

/**
 * Module for handling serialization and deserialization of data contracts
 * (contracts sent from the server using the VSO default REST api serialization settings)
 */
export module ContractSerializer {

    var _legacyDateRegExp: RegExp;

    /**
     * Process a contract in its raw form (e.g. date fields are Dates, and Enums are numbers) and
     * return a pure JSON object that can be posted to REST endpoint.
     *
     * @param data The object to serialize
     * @param contractMetadata The type info/metadata for the contract type being serialized
     * @param preserveOriginal If true, don't modify the original object. False modifies the original object (the return value points to the data argument).
     */
    export function serialize(data: any, contractMetadata: ContractMetadata, preserveOriginal: boolean = true) {
        if (data && contractMetadata) {
            if ($.isArray(data)) {
                return _getTranslatedArray(data, contractMetadata, true, preserveOriginal);
            }
            else {
                return _getTranslatedObject(data, contractMetadata, true, preserveOriginal);
            }
        }
        else {
            return data;
        }
    }
    
    /**
     * Process a pure JSON object (e.g. that came from a REST call) and transform it into a JS object
     * where date strings are converted to Date objects and enum values are converted from strings into
     * their numerical value.
     *
     * @param data The object to deserialize
     * @param contractMetadata The type info/metadata for the contract type being deserialize
     * @param preserveOriginal If true, don't modify the original object. False modifies the original object (the return value points to the data argument).
     * @param unwrapWrappedCollections If true check for wrapped arrays (REST apis will not return arrays directly as the root result but will instead wrap them in a { values: [], count: 0 } object.
     */
    export function deserialize(data: any, contractMetadata: ContractMetadata, preserveOriginal: boolean = true, unwrapWrappedCollections: boolean = false) {
        if (data) {
            if (unwrapWrappedCollections && $.isArray((<IWebApiArrayResult>data).value)) {
                // Wrapped json array - unwrap it and send the array as the result
                data = (<IWebApiArrayResult>data).value;
            }

            if (contractMetadata) {
                if ($.isArray(data)) {
                    data = _getTranslatedArray(data, contractMetadata, false, preserveOriginal);
                }
                else {
                    data = _getTranslatedObject(data, contractMetadata, false, preserveOriginal);
                }
            }
        }
        return data;
    }

    function _getTranslatedArray(array: any, typeMetadata: ContractMetadata, serialize: boolean, preserveOriginal: boolean) {
        var resultArray: any[] = array;

        var arrayCopy: any[] = [];

        $.each(array, (i: number, item: any) => {
            var processedItem: any;

            // handle arrays of arrays
            if ($.isArray(item)) {
                processedItem = _getTranslatedArray(item, typeMetadata, serialize, preserveOriginal);
            }
            else {
                processedItem = _getTranslatedObject(item, typeMetadata, serialize, preserveOriginal);
            }

            if (preserveOriginal) {
                arrayCopy.push(processedItem);
                if (processedItem !== item) {
                    resultArray = arrayCopy;
                }
            }
            else {
                array[i] = processedItem;
            }
        });

        return resultArray;
    }

    function _getTranslatedObject(typeObject: any, typeMetadata: ContractMetadata, serialize: boolean, preserveOriginal: boolean) {
        var processedItem = typeObject,
            copiedItem = false;
        
        if (typeObject && typeMetadata.fields) {
            $.each(typeMetadata.fields, (fieldName: string, fieldMetadata: ContractFieldMetadata) => {
                var fieldValue = typeObject[fieldName];
                var translatedValue = _getTranslatedField(fieldValue, fieldMetadata, serialize, preserveOriginal);
                if (fieldValue !== translatedValue) {
                    if (preserveOriginal && !copiedItem) {
                        processedItem = $.extend({}, typeObject);
                        copiedItem = true;
                    }
                    processedItem[fieldName] = translatedValue;
                }
            });
        }

        return processedItem;
    }

    function _getTranslatedField(fieldValue: any, fieldMetadata: ContractFieldMetadata, serialize: boolean, preserveOriginal: boolean) {

        if (!fieldValue) {
            return fieldValue;
        }

        if (fieldMetadata.isArray) {
            if ($.isArray(fieldValue)) {

                var newArray: any[] = [],                    
                    processedArray: any[] = fieldValue;

                $.each(fieldValue, (index: number, arrayValue: any) => {
                    var processedValue = arrayValue;
                    if (fieldMetadata.isDate) {
                        processedValue = _getTranslatedDateValue(arrayValue, serialize);
                    }
                    else if (fieldMetadata.enumType) {
                        processedValue = _getTranslatedEnumValue(fieldMetadata.enumType, arrayValue, serialize);
                    }
                    else if (fieldMetadata.typeInfo) {
                        if ($.isArray(arrayValue)) {
                            processedValue = _getTranslatedArray(arrayValue, fieldMetadata.typeInfo, serialize, preserveOriginal);
                        }
                        else {
                            processedValue = _getTranslatedObject(arrayValue, fieldMetadata.typeInfo, serialize, preserveOriginal);
                        }
                    }

                    if (preserveOriginal) {
                        newArray.push(processedValue);
                        if (processedValue !== arrayValue) {
                            processedArray = newArray;
                        }
                    }
                    else {
                        fieldValue[index] = processedValue;
                    }
                });

                return processedArray;
            }
            else {
                return fieldValue;
            }
        }
        else if (fieldMetadata.isDictionary) {
            var dictionaryModified = false;
            var newDictionary = <any>{};
            $.each(fieldValue, (key: any, dictionaryValue: any) => {
                var newKey = key,
                    newValue = dictionaryValue;

                if (fieldMetadata.dictionaryKeyIsDate) {
                    newKey = _getTranslatedDateValue(key, serialize);
                }
                else if (fieldMetadata.dictionaryKeyEnumType) {
                    newKey = _getTranslatedEnumValue(fieldMetadata.dictionaryKeyEnumType, key, serialize);
                }

                if (fieldMetadata.dictionaryValueIsDate) {
                    newValue = _getTranslatedDateValue(dictionaryValue, serialize);
                }
                else if (fieldMetadata.dictionaryValueEnumType) {
                    newValue = _getTranslatedEnumValue(fieldMetadata.dictionaryValueEnumType, dictionaryValue, serialize);
                }
                else if (fieldMetadata.dictionaryValueTypeInfo) {
                    newValue = _getTranslatedObject(newValue, fieldMetadata.dictionaryValueTypeInfo, serialize, preserveOriginal);
                }
                else if (fieldMetadata.dictionaryValueFieldInfo) {
                    newValue = _getTranslatedField(dictionaryValue, fieldMetadata.dictionaryValueFieldInfo, serialize, preserveOriginal);
                }

                newDictionary[newKey] = newValue;
                if (key !== newKey || dictionaryValue !== newValue) {
                    dictionaryModified = true;
                }
            });
            return dictionaryModified ? newDictionary : fieldValue;
        }
        else {
            if (fieldMetadata.isDate) {
                return _getTranslatedDateValue(fieldValue, serialize);
            }
            else if (fieldMetadata.enumType) {
                return _getTranslatedEnumValue(fieldMetadata.enumType, fieldValue, serialize);
            }
            else if (fieldMetadata.typeInfo) {
                return _getTranslatedObject(fieldValue, fieldMetadata.typeInfo, serialize, preserveOriginal);
            }
            else {
                return fieldValue;
            }
        }
    }

    function _getTranslatedEnumValue(enumType: ContractEnumMetadata, valueToConvert: any, serialize: boolean): any {
        if (serialize && typeof valueToConvert === "number") {
            // Serialize: number --> String
            // Because webapi handles the numerical value for enums, there is no need to convert to string.
            // Let this fall through to return the numerical value.
        }
        else if (!serialize && typeof valueToConvert === "string") {
            // Deserialize: String --> number
            var result = 0;
            if (valueToConvert) {
                $.each(valueToConvert.split(","), (i: number, valuePart: string) => {
                    var enumName = $.trim(valuePart) || "";
                    if (enumName) {
                        var resultPart = enumType.enumValues[enumName];

                        if (!resultPart) {
                            // No matching enum value. Try again but case insensitive
                            var lowerCaseEnumName = enumName.toLowerCase();
                            if (lowerCaseEnumName !== enumName) {
                                $.each(enumType.enumValues, (n: string, v: number) => {
                                    if (n.toLowerCase() === lowerCaseEnumName) {
                                        resultPart = v;
                                        return false;
                                    }
                                });
                            }
                        }

                        if (resultPart) {
                            result |= resultPart;
                        }
                    }
                });
            }
            return result;
        }
        return valueToConvert;
    }

    function _getTranslatedDateValue(valueToConvert: any, serialize: boolean): any {
        if (serialize && (valueToConvert instanceof Date) && Date.prototype.toISOString) {
            return (<Date>valueToConvert).toISOString();
        }
        else if (!serialize && typeof valueToConvert === "string") {
            // Deserialize: String --> Date
            var dateValue = new Date(valueToConvert);
            if (isNaN(<any>dateValue) && navigator.userAgent && /msie/i.test(navigator.userAgent)) {
                dateValue = _convertLegacyIEDate(valueToConvert);
            }
            return dateValue;
        }
        return valueToConvert;
    }

    function _convertLegacyIEDate(dateStringValue: string) {
        // IE 8/9 does not handle parsing dates in ISO form like:
        // 2013-05-13T14:26:54.397Z
        var match: RegExpExecArray;

        if (!_legacyDateRegExp) {
            _legacyDateRegExp = new RegExp("(\\d+)-(\\d+)-(\\d+)T(\\d+):(\\d+):(\\d+).(\\d+)Z");
        }

        match = _legacyDateRegExp.exec(dateStringValue);
        if (match) {
            return new Date(Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6]), parseInt(match[7])));
        }
        else {
            return null;
        }
    }
}

/**
* Deserialize the JSON island data that is stored in the given element
*
* @param $element JQuery element containing the JSON to deserialize
* @param contractMetadata The type info/metadata for the contract type being deserialize
* @param removeElement If true remove the element from the DOM after deserializing the content
*/
export function deserializeJsonIsland<T>($element: JQuery, contractMetadata: ContractMetadata, removeElement: boolean = false): T {
    var content: T = null;
    if ($element && $element.length) {
        var html = $element.html();
        content = <T>ContractSerializer.deserialize(JSON.parse(html), contractMetadata, true);
        if (removeElement) {
            $element.remove();
        }
    }
    return content;
}
