import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * Track the soft-keyboard's on-screen height — including IME suggestion
 * rails (Samsung's number-strip, Gboard's clipboard row, etc.) — so a
 * sheet or composer can pad itself above the keyboard manually.
 *
 * KeyboardAvoidingView is unreliable inside `<Modal>` on Android: the
 * Modal lives in its own Window, which doesn't always honor the host
 * activity's adjustResize, so the composer ends up under the keyboard.
 * Reading the events directly works on both platforms.
 *
 * iOS fires `keyboardWillShow/Hide` ahead of the animation; Android only
 * fires `keyboardDidShow/Hide` reliably, so we subscribe per platform.
 * Returns 0 when no keyboard is visible.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setHeight(0);
    const showSub = Keyboard.addListener(showName, onShow);
    const hideSub = Keyboard.addListener(hideName, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}
