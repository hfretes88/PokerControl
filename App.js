import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { C } from './src/components/UI';

import HomeScreen from './src/screens/HomeScreen';
import PlayersScreen from './src/screens/PlayersScreen';
import SessionScreen from './src/screens/SessionScreen';
import StatsScreen from './src/screens/StatsScreen';
import DebtScreen from './src/screens/DebtScreen';
import RankingScreen from './src/screens/RankingScreen';
import PendingDebtsScreen from './src/screens/PendingDebtsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={C.card} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.card },
          headerTintColor: C.accent,
          headerTitleStyle: { fontWeight: '700', color: C.white },
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Players" component={PlayersScreen} options={{ title: 'Jugadores' }} />
        <Stack.Screen name="Session" component={SessionScreen} options={{ title: 'Partida' }} />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          options={({ route }) => ({ title: `📊 ${route.params.playerName}` })}
        />
        <Stack.Screen
          name="Debts"
          component={DebtScreen}
          options={{ title: '💳 Pagos pendientes' }}
        />
        <Stack.Screen
          name="Ranking"
          component={RankingScreen}
          options={{ title: '🏆 Ranking' }}
        />
        <Stack.Screen
          name="PendingDebts"
          component={PendingDebtsScreen}
          options={{ title: '💳 Deudas pendientes' }}
        />        
      </Stack.Navigator>
    </NavigationContainer>
  );
}
