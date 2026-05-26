import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { C } from './src/components/UI';

import HomeScreen from './src/screens/HomeScreen';
import PlayersScreen from './src/screens/PlayersScreen';
import SessionScreen from './src/screens/SessionScreen';

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
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Players"
          component={PlayersScreen}
          options={{ title: 'Jugadores', headerBackTitle: 'Volver' }}
        />
        <Stack.Screen
          name="Session"
          component={SessionScreen}
          options={{ headerBackTitle: 'Volver' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
