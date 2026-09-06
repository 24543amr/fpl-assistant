import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { getStoredTeamId, getStoredFplToken } from '@/utils/storage';
import {
  fetchBootstrap,
  fetchUserEntry,
  fetchMyTeamSquad,
  sendAiChatMessage,
  getPlayerPhotoUrl,
  ReferencedPlayer,
  AiChatMessage,
} from '@/api/fpl';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  referencedPlayer?: ReferencedPlayer | null;
}

const POSITION_NAMES: Record<number, string> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

// ── PROMPT CHIPS ─────────────────────────────────────────────────────────────
const EN_SUGGESTED_CHIPS = [
  'Who should I captain?',
  'Suggest a transfer',
  'Analyze my squad',
  'Any injury concerns?',
];

const AR_SUGGESTED_CHIPS = [
  'مين أعين كابتن؟',
  'اقترح تبديل',
  'حلل فريقي',
  'في إصابات؟',
];

// ── MEMOIZED CHAT INPUT BAR ──────────────────────────────────────────────────
interface ChatInputBarProps {
  inputText: string;
  onChangeText: (text: string) => void;
  onSend: (text?: string) => void;
  isLoading: boolean;
  isArabic: boolean;
  suggestedChips: string[];
}

const ChatInputBar = React.memo(function ChatInputBar({
  inputText,
  onChangeText,
  onSend,
  isLoading,
  isArabic,
  suggestedChips,
}: ChatInputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isRTL = isArabic;
  const flexDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_400' : 'HankenGrotesk_400';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'HankenGrotesk_600';
  const monoFont = 'JetBrainsMono_500';

  return (
    <View style={styles.inputBarWrapper} pointerEvents="box-none">
      {/* Suggested Prompt Chips */}
      <View style={styles.chipsWrapper} pointerEvents="box-none">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipsRow, { flexDirection: flexDir }]}
          keyboardShouldPersistTaps="handled"
        >
          {suggestedChips.map((chip, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.promptChip}
              onPress={() => {
                console.log('[PromptChip TOUCHED]', chip, Date.now());
                onSend(chip);
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-outward" size={13} color={Colors.brandTeal} />
              <Text style={[styles.promptChipText, { fontFamily: labelFont }]}>
                {chip}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input Field & Action Buttons */}
      <View
        style={[
          styles.inputContainer,
          { flexDirection: flexDir },
          isFocused && styles.inputContainerFocused,
        ]}
      >
        <TouchableOpacity
          style={styles.micBtn}
          activeOpacity={0.7}
          onPress={() => console.log('[Mic TOUCHED]', Date.now())}
        >
          <MaterialIcons name="mic-none" size={22} color={Colors.onSurfaceVariant} />
        </TouchableOpacity>

        <TextInput
          style={[
            styles.textInput,
            {
              fontFamily: bodyFont,
              textAlign,
            },
          ]}
          placeholder={isArabic ? 'اسأل عن فريقك...' : 'Ask about your team...'}
          placeholderTextColor={Colors.onSurfaceVariant}
          value={inputText}
          onChangeText={onChangeText}
          onFocus={() => {
            console.log('INPUT FOCUSED', Date.now());
            setIsFocused(true);
          }}
          onBlur={() => {
            console.log('INPUT BLURRED', Date.now());
            setIsFocused(false);
          }}
          multiline={false}
          maxLength={400}
          blurOnSubmit={false}
          keyboardType="default"
          returnKeyType="send"
          onSubmitEditing={() => onSend()}
          selectionColor={Colors.brandTeal}
        />

        <TouchableOpacity
          style={[
            styles.sendBtn,
            (!inputText.trim() || isLoading) && styles.sendBtnDisabled,
          ]}
          disabled={!inputText.trim() || isLoading}
          onPress={() => {
            console.log('[SendBtn TOUCHED]', Date.now());
            onSend();
          }}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.brandPurple} />
          ) : (
            <MaterialIcons
              name={isRTL ? 'arrow-back' : 'arrow-forward'}
              size={20}
              color={Colors.brandPurple}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Disclaimer Text */}
      <Text style={[styles.disclaimerText, { fontFamily: monoFont }]}>
        {isArabic
          ? 'الذكاء الاصطناعي ممكن يخطئ. تأكد من الإحصائيات المهمة.'
          : 'AI can make mistakes. Verify important stats.'}
      </Text>
    </View>
  );
});

export default function AiScreen() {
  const router = useRouter();
  const [isArabic, setIsArabic] = useState(false);
  const isRTL = isArabic;

  // Real App Context State
  const [currentGw, setCurrentGw] = useState<number>(1);
  const [bankBudget, setBankBudget] = useState<number>(0.0);
  const [teamId, setTeamId] = useState<string>('');
  const [sessionStartTime] = useState<string>(() => {
    const d = new Date();
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  });

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Animations
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  // Fonts
  const headlineFont = isArabic ? 'Cairo_700' : 'ArchivoNarrow_700';
  const bodyFont = isArabic ? 'IBMPlexSansArabic_400' : 'HankenGrotesk_400';
  const labelFont = isArabic ? 'IBMPlexSansArabic_600' : 'HankenGrotesk_600';
  const monoFont = 'JetBrainsMono_500';

  // Load Team Context (GW & Budget)
  useEffect(() => {
    let isMounted = true;
    async function loadAppContext() {
      try {
        const storedId = await getStoredTeamId();
        const effectiveId = storedId || '1763262';
        if (storedId && isMounted) setTeamId(storedId);

        const [bootstrap, tokens] = await Promise.all([
          fetchBootstrap().catch(() => null),
          getStoredFplToken().catch(() => null),
        ]);

        if (bootstrap?.events && isMounted) {
          const activeGw = bootstrap.events.find((e: any) => e.is_current)?.id
            || bootstrap.events.find((e: any) => e.is_next)?.id
            || 1;
          setCurrentGw(activeGw);
        }

        let resolvedBank = 0;
        if (tokens?.accessToken && storedId) {
          try {
            const squad = await fetchMyTeamSquad(storedId, tokens.accessToken);
            if (squad?.transfers?.bank !== undefined) {
              resolvedBank = squad.transfers.bank / 10;
            }
          } catch (_) {}
        }

        if (resolvedBank === 0) {
          const entry = await fetchUserEntry(effectiveId).catch(() => null);
          if (entry && (entry as any).last_deadline_bank !== undefined) {
            resolvedBank = ((entry as any).last_deadline_bank || 0) / 10;
          }
        }

        if (isMounted) {
          setBankBudget(resolvedBank);
        }
      } catch (err) {
        console.warn('[AiChat] Error loading context:', err);
      }
    }
    void loadAppContext();
    return () => {
      isMounted = false;
    };
  }, []);

  // Pulsing animation for empty state icon
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Typing indicator dots animation
  useEffect(() => {
    if (!isLoading) return;
    const createBounce = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );
    };

    const b1 = createBounce(dot1Anim, 0);
    const b2 = createBounce(dot2Anim, 180);
    const b3 = createBounce(dot3Anim, 360);

    b1.start();
    b2.start();
    b3.start();

    return () => {
      b1.stop();
      b2.stop();
      b3.stop();
      dot1Anim.setValue(0);
      dot2Anim.setValue(0);
      dot3Anim.setValue(0);
    };
  }, [isLoading, dot1Anim, dot2Anim, dot3Anim]);

  // Scroll to bottom on message change
  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      scrollToBottom(true);
    }
  }, [messages.length, isLoading, scrollToBottom]);

  const getFormattedTime = () => {
    const d = new Date();
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  // Handle Send Message
  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text: query,
      time: getFormattedTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    scrollToBottom(true);

    try {
      const history: AiChatMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await sendAiChatMessage(query, teamId || '1763262', history);

      if (res.budget !== undefined) {
        const parsedBudget = parseFloat(res.budget);
        if (!isNaN(parsedBudget)) setBankBudget(parsedBudget);
      }
      if (res.currentGW !== undefined && res.currentGW > 0) {
        setCurrentGw(res.currentGW);
      }

      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: res.reply || (isArabic ? 'تم تحليل طلبك بنجاح.' : 'Analysis complete.'),
        time: getFormattedTime(),
        referencedPlayer: res.referencedPlayer || null,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('[AiChat] Chat error:', err.message, err);
      const errMsg = err.message || '';
      const isBusy = errMsg.includes('busy') || errMsg.includes('مشغول') || errMsg.includes('503') || errMsg.includes('429');
      const isNetwork = errMsg.includes('Network request failed') || errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED');

      let errorText = '';
      if (isBusy) {
        errorText = isArabic
          ? '⚠️ المساعد الذكي مشغول حالياً بسبب ضغط الطلبات. يرجى إعادة المحاولة بعد لحظات.'
          : '⚠️ The AI Assistant is temporarily busy due to high server demand. Please try again in a moment.';
      } else if (isNetwork) {
        errorText = isArabic
          ? '⚠️ تعذر الاتصال بالسيرفر. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.'
          : '⚠️ Network connection failed. Please check your internet and try again.';
      } else {
        errorText = isArabic
          ? '⚠️ عذراً، حدث خطأ في معالجة طلبك. يرجى إعادة المحاولة.'
          : '⚠️ Sorry, could not process your request right now. Please try again.';
      }

      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: errorText,
        time: getFormattedTime(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      scrollToBottom(true);
    }
  }, [inputText, isLoading, messages, teamId, isArabic, scrollToBottom]);

  // Handle New Chat
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputText('');
    setIsLoading(false);
  }, []);

  // Auto-scroll when keyboard opens
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        scrollToBottom(true);
      }
    );
    return () => {
      showSub.remove();
    };
  }, [scrollToBottom]);

  const suggestedChips = isArabic ? AR_SUGGESTED_CHIPS : EN_SUGGESTED_CHIPS;
  const flexDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const KeyboardWrapper = KeyboardAvoidingView;
  const keyboardWrapperProps: { behavior: 'padding' | 'height'; keyboardVerticalOffset: number } = {
    behavior: Platform.OS === 'ios' ? 'padding' : 'height',
    keyboardVerticalOffset: Platform.OS === 'ios' ? 90 : 20,
  };

  return (
    <View style={styles.root}>
      {/* ── SHARED APP HEADER WITH NEW CHAT BUTTON ── */}
      <AppHeader
        title={isArabic ? 'محادثة الذكاء الاصطناعي' : 'AI Chat'}
        isArabic={isArabic}
        onToggleLanguage={setIsArabic}
        icon={<MaterialIcons name="auto-awesome" size={24} color={Colors.brandTeal} />}
        rightAction={
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={handleNewChat}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="refresh" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        }
      />

      {/* ── 1. CONTEXT INDICATOR PILL ── */}
      <View style={styles.contextPillContainer} pointerEvents="none">
        <View style={[styles.contextPill, { flexDirection: flexDir }]}>
          <Text style={[styles.contextPillText, { fontFamily: monoFont }]}>
            {isArabic
              ? `🧠 يعرف: تشكيلتك، الجولة ${currentGw}، ميزانية: £${bankBudget.toFixed(1)}m`
              : `🧠 Knows: Your squad, Gameweek ${currentGw}, Budget: £${bankBudget.toFixed(1)}m`}
          </Text>
        </View>
      </View>

      <KeyboardWrapper
        style={styles.keyboardContainer}
        {...keyboardWrapperProps}
      >
        {/* ── 2. SCROLLABLE CHAT AREA ── */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            messages.length === 0 && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {messages.length === 0 ? (
            /* ── EMPTY STATE ── */
            <View style={styles.emptyStateRoot}>
              <Animated.View
                style={[
                  styles.sparkleCircle,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <MaterialCommunityIcons name="creation" size={42} color={Colors.brandTeal} />
              </Animated.View>

              <Text style={[styles.emptyHeadline, { fontFamily: headlineFont }]}>
                {isArabic ? 'إزاي أقدر أساعد فريقك النهاردة؟' : 'How can I help your team today?'}
              </Text>

              <Text style={[styles.emptySubtext, { fontFamily: bodyFont }]}>
                {isArabic
                  ? 'اسألني أي حاجة عن استراتيجيات الفانتاسي، إحصائيات اللاعبين، أو خطة انتقالات مخصصة.'
                  : 'Ask me anything about FPL strategy, player stats, or getting a personalized transfer plan.'}
              </Text>
            </View>
          ) : (
            /* ── ACTIVE CONVERSATION ── */
            <View style={styles.chatList}>
              {/* Session Start Divider */}
              <View style={styles.sessionDivider}>
                <Text style={[styles.sessionDividerText, { fontFamily: monoFont }]}>
                  {isArabic ? `اليوم، ${sessionStartTime}` : `Today, ${sessionStartTime}`}
                </Text>
              </View>

              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const userBubbleAlign = isRTL ? 'flex-start' : 'flex-end';
                const aiBubbleAlign = isRTL ? 'flex-end' : 'flex-start';

                if (isUser) {
                  return (
                    <View
                      key={msg.id}
                      style={[
                        styles.messageRow,
                        { alignItems: userBubbleAlign },
                      ]}
                    >
                      <View
                        style={[
                          styles.userBubble,
                          isRTL ? styles.userBubbleRtl : styles.userBubbleLtr,
                        ]}
                      >
                        <Text style={[styles.userMessageText, { fontFamily: bodyFont, textAlign }]}>
                          {msg.text}
                        </Text>
                      </View>
                      <Text style={[styles.timestampText, { fontFamily: monoFont }]}>
                        {msg.time}
                      </Text>
                    </View>
                  );
                }

                // AI Message Bubble
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageRow,
                      { alignItems: aiBubbleAlign },
                    ]}
                  >
                    {/* Assistant Label */}
                    <View style={[styles.aiLabelRow, { flexDirection: flexDir }]}>
                      <MaterialCommunityIcons name="creation" size={14} color={Colors.brandTeal} />
                      <Text style={[styles.aiLabelText, { fontFamily: labelFont }]}>
                        {isArabic ? 'مساعد الفانتاسي' : 'FPL Assistant'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.aiBubble,
                        isRTL ? styles.aiBubbleRtl : styles.aiBubbleLtr,
                      ]}
                    >
                      <Text style={[styles.aiMessageText, { fontFamily: bodyFont, textAlign }]}>
                        {msg.text}
                      </Text>

                      {/* Embedded Player Card */}
                      {!!msg.referencedPlayer && (
                        <View style={styles.embeddedCard}>
                          <View style={[styles.playerCardRow, { flexDirection: flexDir }]}>
                            {/* Photo */}
                            <Image
                              source={{
                                uri: getPlayerPhotoUrl(msg.referencedPlayer as any, msg.referencedPlayer.code),
                              }}
                              style={styles.playerAvatar}
                            />

                            {/* Player Info */}
                            <View style={[styles.playerInfoCol, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                              <Text style={[styles.playerName, { fontFamily: headlineFont }]}>
                                {msg.referencedPlayer.web_name}
                              </Text>
                              <Text style={[styles.playerMeta, { fontFamily: monoFont }]}>
                                {POSITION_NAMES[msg.referencedPlayer.element_type] || 'MID'} • {msg.referencedPlayer.team_short || 'PL'}
                              </Text>

                              <View style={[styles.tagsRow, { flexDirection: flexDir }]}>
                                <View style={styles.formTag}>
                                  <Text style={[styles.formTagText, { fontFamily: monoFont }]}>
                                    Form: {msg.referencedPlayer.form}
                                  </Text>
                                </View>
                                <View style={styles.costTag}>
                                  <Text style={[styles.costTagText, { fontFamily: monoFont }]}>
                                    £{(msg.referencedPlayer.now_cost / 10).toFixed(1)}m
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* View Button */}
                            <TouchableOpacity
                              style={[styles.viewBtn, { flexDirection: flexDir }]}
                              onPress={() => router.push('/squad')}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.viewBtnText, { fontFamily: labelFont }]}>
                                {isArabic ? 'عرض' : 'View'}
                              </Text>
                              <MaterialIcons
                                name={isRTL ? 'arrow-back' : 'arrow-forward'}
                                size={14}
                                color={Colors.brandPurple}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.timestampText, { fontFamily: monoFont }]}>
                      {msg.time}
                    </Text>
                  </View>
                );
              })}

              {/* Typing Indicator */}
              {isLoading && (
                <View style={[styles.messageRow, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.aiLabelRow, { flexDirection: flexDir }]}>
                    <MaterialCommunityIcons name="creation" size={14} color={Colors.brandTeal} />
                    <Text style={[styles.aiLabelText, { fontFamily: labelFont }]}>
                      {isArabic ? 'جاري التحليل...' : 'Analyzing...'}
                    </Text>
                  </View>
                  <View style={[styles.typingBubble, isRTL ? styles.aiBubbleRtl : styles.aiBubbleLtr]}>
                    <Animated.View style={[styles.dot, { transform: [{ translateY: dot1Anim }] }]} />
                    <Animated.View style={[styles.dot, { transform: [{ translateY: dot2Anim }] }]} />
                    <Animated.View style={[styles.dot, { transform: [{ translateY: dot3Anim }] }]} />
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* ── 3. INPUT BAR (STICKY BOTTOM, MEMOIZED) ── */}
        <ChatInputBar
          inputText={inputText}
          onChangeText={setInputText}
          onSend={handleSendMessage}
          isLoading={isLoading}
          isArabic={isArabic}
          suggestedChips={suggestedChips}
        />
      </KeyboardWrapper>

      {/* ── SHARED BOTTOM NAVIGATION BAR ── */}
      <BottomNav activeTab="ai" isArabic={isArabic} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brandPurple,
  },
  newChatBtn: {
    padding: 6,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  keyboardContainer: {
    flex: 1,
  },

  // 1. Context Indicator Pill
  contextPillContainer: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  contextPill: {
    backgroundColor: 'rgba(74, 14, 82, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextPillText: {
    color: Colors.brandTeal,
    fontSize: 11,
    letterSpacing: 0.2,
  },

  // Scroll Content
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 2. Empty State
  emptyStateRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    width: '100%',
  },
  sparkleCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(74, 14, 82, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 255, 135, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    // ai-glow
    shadowColor: Colors.brandTeal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 8,
  },
  emptyHeadline: {
    color: Colors.white,
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: Spacing.xl,
  },
  chipsWrapper: {
    marginBottom: 8,
  },
  chipsRow: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 255, 135, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radii.full,
  },
  promptChipText: {
    color: Colors.brandTeal,
    fontSize: 12,
  },

  // 3. Active Conversation State
  chatList: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  sessionDivider: {
    alignItems: 'center',
    marginVertical: Spacing.xs,
  },
  sessionDividerText: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },

  messageRow: {
    marginVertical: 4,
    maxWidth: '86%',
    alignSelf: 'stretch',
  },

  // User Bubble (Solid Teal #00FF87, Dark Purple text)
  userBubble: {
    backgroundColor: Colors.brandTeal,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '85%',
  },
  userBubbleLtr: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  userBubbleRtl: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  userMessageText: {
    color: Colors.brandPurple,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },

  // AI Bubble (#4A0E52 brand-purple-light, White body text)
  aiLabelRow: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  aiLabelText: {
    color: Colors.brandTeal,
    fontSize: 11,
  },
  aiBubble: {
    backgroundColor: '#4A0E52',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxWidth: '92%',
  },
  aiBubbleLtr: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  aiBubbleRtl: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  aiMessageText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 21,
  },

  timestampText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    marginTop: 4,
    paddingHorizontal: 4,
    opacity: 0.8,
  },

  // Embedded Player Card
  embeddedCard: {
    marginTop: 12,
    backgroundColor: 'rgba(26, 3, 29, 0.7)',
    borderRadius: Radii.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.2)',
  },
  playerCardRow: {
    alignItems: 'center',
    gap: 10,
  },
  playerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2A0530',
    borderWidth: 1,
    borderColor: Colors.brandTeal,
  },
  playerInfoCol: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    color: Colors.white,
    fontSize: 15,
  },
  playerMeta: {
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  tagsRow: {
    gap: 6,
    marginTop: 4,
  },
  formTag: {
    backgroundColor: 'rgba(0, 255, 135, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
  },
  formTagText: {
    color: Colors.brandTeal,
    fontSize: 10,
    fontWeight: '700',
  },
  costTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.default,
  },
  costTagText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
  },
  viewBtn: {
    backgroundColor: Colors.brandTeal,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  viewBtnText: {
    color: Colors.brandPurple,
    fontSize: 11,
    fontWeight: '700',
  },

  // Typing Indicator Bubble
  typingBubble: {
    backgroundColor: '#4A0E52',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brandTeal,
  },

  // 4. Input Bar
  inputBarWrapper: {
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: Colors.brandPurple,
  },
  inputContainer: {
    backgroundColor: '#1E0021',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radii.xxl,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
  },
  inputContainerFocused: {
    borderColor: Colors.brandTeal,
  },
  micBtn: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    color: Colors.white,
    fontSize: 14,
    maxHeight: 90,
    minHeight: 38,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  disclaimerText: {
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    opacity: 0.7,
  },
});
