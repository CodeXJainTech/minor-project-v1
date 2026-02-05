export function encrypt(message: string, shift = 3): string {
  let result = "";

  for (const char of message) {
    if (char >= "a" && char <= "z") {
      result += String.fromCharCode(
        ((char.charCodeAt(0) - 97 + shift) % 26) + 97
      );
    } else if (char >= "A" && char <= "Z") {
      result += String.fromCharCode(
        ((char.charCodeAt(0) - 65 + shift) % 26) + 65
      );
    } else {
      result += String.fromCharCode(
        ((char.charCodeAt(0) - 8 + shift) % 26) + 8
      );;
    }
  }

  return result;
}
